import { Injectable, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { effectivePriceCents } from '../pricing/service-price';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private notifications: NotificationsService,
  ) {}

  /** Acha o cliente pelo telefone ou cria. Atualiza nome/email se vierem. */
  async findOrCreateCustomer(businessId: string, phone: string, name?: string, email?: string) {
    const update: { name?: string; email?: string } = {};
    if (name) update.name = name;
    if (email) update.email = email;
    return this.prisma.customer.upsert({
      where: { businessId_phone: { businessId, phone } },
      create: { businessId, phone, name, email },
      update,
    });
  }

  /**
   * Cria o agendamento. Revalida o slot DENTRO de uma transação pra não
   * permitir overbooking. startAtIso deve ser um instante ISO (com offset)
   * que veio de um slot ofertado pelo motor de disponibilidade.
   *
   * O agendamento já nasce CONFIRMED.
   */
  async createAppointment(params: {
    businessId: string;
    customerId: string;
    professionalId: string;
    serviceId: string;
    startAtIso: string;
    notes?: string;
  }) {
    const { businessId, customerId, professionalId, serviceId, startAtIso, notes } = params;

    const start = DateTime.fromISO(startAtIso);
    if (!start.isValid) {
      throw new BadRequestException(`startAt inválido: ${startAtIso}`);
    }

    const created = await this.runBookingTransaction({
      businessId,
      customerId,
      professionalId,
      serviceId,
      start,
      notes,
    });

    // Confirmado: avisa o dono (canais ligados) e o cliente (e-mail). Fire-and-forget.
    void this.notifications.notifyNewBooking(created.appointment.id);
    void this.sendCustomerEmail(created.appointment);
    return { appointment: created.appointment };
  }

  /** E-mail de confirmação pro cliente (se ele deu email e o SMTP estiver ligado). */
  private async sendCustomerEmail(appt: {
    businessId: string;
    startAt: Date;
    service: { name: string };
    professional: { name: string };
    customer: { email: string | null };
  }): Promise<void> {
    if (!this.mail.enabled || !appt.customer.email) return;
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: appt.businessId },
      select: { name: true, timezone: true, address: true },
    });
    const when = DateTime.fromJSDate(appt.startAt)
      .setZone(business.timezone)
      .setLocale('pt-BR')
      .toFormat("cccc, dd/LL 'às' HH:mm");
    await this.mail.sendBookingConfirmation(appt.customer.email, {
      businessName: business.name,
      service: appt.service.name,
      professional: appt.professional.name,
      when,
      address: business.address,
    });
  }

  /**
   * A transação do recheck + criação. Isolada pra mapear a exclusion constraint
   * do banco (appointment_no_overlap) num 409 limpo, caso uma corrida rara passe
   * pelo recheck. É a última linha de defesa contra overbooking.
   */
  private async runBookingTransaction(params: {
    businessId: string;
    customerId: string;
    professionalId: string;
    serviceId: string;
    start: DateTime;
    notes?: string;
  }) {
    const { businessId, customerId, professionalId, serviceId, start, notes } = params;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const service = await tx.service.findUniqueOrThrow({ where: { id: serviceId } });
        const business = await tx.business.findUniqueOrThrow({
          where: { id: businessId },
          select: { timezone: true },
        });
        const startAt = start.toUTC().toJSDate();
        const endAt = start.plus({ minutes: service.durationMinutes }).toUTC().toJSDate();

        // Recheck: existe agendamento ativo do profissional que sobreponha?
        const conflict = await tx.appointment.findFirst({
          where: {
            professionalId,
            status: { in: ['PENDING', 'CONFIRMED'] },
            startAt: { lt: endAt },
            endAt: { gt: startAt },
          },
          select: { id: true },
        });
        if (conflict) {
          throw new ConflictException('Esse horário acabou de ser ocupado. Escolha outro.');
        }

        // Recheck: cai dentro de algum bloqueio?
        const blocked = await tx.timeBlock.findFirst({
          where: {
            businessId,
            OR: [{ professionalId }, { professionalId: null }],
            startAt: { lt: endAt },
            endAt: { gt: startAt },
          },
          select: { id: true },
        });
        if (blocked) {
          throw new ConflictException('Esse horário não está mais disponível.');
        }

        // Recheck: cai dentro de um bloqueio recorrente (folga/almoço semanal)?
        // Comparamos em minutos-do-dia, no fuso do negócio, pro mesmo dia da semana.
        const local = start.setZone(business.timezone);
        const weekday = local.weekday % 7; // 0=domingo … 6=sábado
        const startMin = local.hour * 60 + local.minute;
        const endMin = startMin + service.durationMinutes;
        const recurringHit = await tx.recurringBlock.findFirst({
          where: {
            businessId,
            weekday,
            OR: [{ professionalId }, { professionalId: null }],
            startMinute: { lt: endMin },
            endMinute: { gt: startMin },
          },
          select: { id: true },
        });
        if (recurringHit) {
          throw new ConflictException('Esse horário não está mais disponível.');
        }

        // Preço COM desconto (helper puro). É o que vale pro faturamento: um kit
        // vira um único item (nome + preço do kit), preservando "total = preço do kit".
        const priceCents = effectivePriceCents(service);

        const appointment = await tx.appointment.create({
          data: {
            businessId,
            customerId,
            professionalId,
            serviceId,
            startAt,
            endAt,
            notes,
            status: 'CONFIRMED',
            // Item espelho do serviço principal + total inicial. O dono pode
            // acrescentar/editar itens depois (até pagar) e o total acompanha.
            totalCents: priceCents,
            items: {
              create: {
                name: service.name,
                priceCents,
                sourceServiceId: service.id,
              },
            },
          },
          include: { service: true, professional: true, customer: true },
        });

        return { appointment };
      });
    } catch (e) {
      // Última linha contra overbooking: a exclusion constraint do banco
      // (appointment_no_overlap) vira um 409 limpo se uma corrida passar pelo recheck.
      if (e instanceof Error && /appointment_no_overlap|exclusion|23P01/i.test(e.message)) {
        throw new ConflictException('Esse horário acabou de ser ocupado. Escolha outro.');
      }
      throw e;
    }
  }

  /**
   * Cancela um agendamento do negócio.
   *
   * `customerId` restringe ao dono do agendamento e é OBRIGATÓRIO quando quem
   * pede é o próprio cliente (agente do WhatsApp): ali o pedido nasce de texto
   * livre de terceiro, e sem esse filtro basta ter o id pra cancelar o horário
   * de outra pessoa do mesmo negócio. O painel chama sem ele de propósito — o
   * dono pode cancelar qualquer agendamento da própria agenda.
   */
  async cancelAppointment(businessId: string, appointmentId: string, customerId?: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, businessId, ...(customerId ? { customerId } : {}) },
    });
    if (!appt) throw new BadRequestException('Agendamento não encontrado.');
    if (appt.status === 'CANCELLED') return appt;

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED' },
    });
  }

  /** Próximos agendamentos ativos de um cliente. */
  async getUpcomingForCustomer(businessId: string, customerId: string) {
    return this.prisma.appointment.findMany({
      where: {
        businessId,
        customerId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startAt: { gte: new Date() },
      },
      orderBy: { startAt: 'asc' },
      include: { service: true, professional: true },
    });
  }
}
