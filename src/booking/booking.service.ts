import { Injectable, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { CloudApiProvider } from '../whatsapp/whatsapp.provider';
import { MailService } from '../mail/mail.service';

const HOLD_MINUTES = 15; // janela pra pagar o sinal antes de liberar o horário
const FAR_FUTURE_DAYS = 60; // > 2 meses: exige sinal mesmo sem o toggle ligado
const FAR_FUTURE_DEPOSIT_PCT = 0.3; // sinal padrão p/ data distante quando o negócio não definiu valor

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private prisma: PrismaService,
    private stripe: StripeService,
    private whatsapp: CloudApiProvider,
    private mail: MailService,
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
   * Se o negócio exige sinal, o agendamento nasce PENDING segurando o horário e
   * volta um `checkoutUrl`; só vira CONFIRMED quando o pagamento cai (webhook).
   * Sem sinal, já nasce CONFIRMED como antes.
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

    // Cobrança do sinal fica FORA da transação (chamada externa ao Stripe).
    if (created.deposit) {
      let checkout: { url: string; sessionId: string };
      try {
        checkout = await this.stripe.createDepositCheckout({
          appointmentId: created.appointment.id,
          slug: created.slug,
          serviceName: created.appointment.service.name,
          depositCents: created.deposit,
        });
      } catch (err) {
        // Falhou abrir o pagamento: solta o horário na hora (não deixa hold órfão).
        await this.prisma.appointment.delete({ where: { id: created.appointment.id } });
        throw err;
      }
      await this.prisma.appointment.update({
        where: { id: created.appointment.id },
        data: { stripeSessionId: checkout.sessionId },
      });
      return { appointment: created.appointment, checkoutUrl: checkout.url };
    }

    // Já confirmado (sem sinal): avisa o dono (WhatsApp) e o cliente (e-mail). Fire-and-forget.
    void this.notifyOwnersNewBooking(created.appointment);
    void this.sendCustomerEmail(created.appointment);
    return { appointment: created.appointment, checkoutUrl: undefined as string | undefined };
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
   * Avisa os donos (no WhatsApp cadastrado no perfil) que entrou um agendamento.
   * Só envia se o WhatsApp estiver configurado e o dono tiver telefone. Nunca
   * derruba o fluxo de booking.
   */
  private async notifyOwnersNewBooking(appt: {
    businessId: string;
    startAt: Date;
    service: { name: string };
    professional: { name: string };
    customer: { name: string | null; phone: string };
  }): Promise<void> {
    try {
      if (!process.env.WHATSAPP_TOKEN) return;
      const business = await this.prisma.business.findUniqueOrThrow({
        where: { id: appt.businessId },
        select: { name: true, timezone: true },
      });
      const owners = await this.prisma.owner.findMany({
        where: { businessId: appt.businessId, phone: { not: null } },
        select: { phone: true },
      });
      if (owners.length === 0) return;

      const when = DateTime.fromJSDate(appt.startAt)
        .setZone(business.timezone)
        .setLocale('pt-BR')
        .toFormat("cccc, dd/LL 'às' HH:mm");
      const text =
        `🗓️ Novo agendamento na ${business.name}\n` +
        `${appt.service.name} com ${appt.professional.name}\n` +
        `${when}\n` +
        `Cliente: ${appt.customer.name ?? 'sem nome'} (${appt.customer.phone})`;

      for (const o of owners) {
        if (o.phone) await this.whatsapp.sendText(o.phone, text).catch(() => undefined);
      }
    } catch (err) {
      this.logger.warn(`Falha ao avisar dono de novo agendamento: ${(err as Error).message}`);
    }
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
          select: { slug: true, requireDeposit: true, depositCents: true },
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

        // Sinal: ligado pelo dono OU automático pra datas > 2 meses (anti no-show).
        // Valor: o que o dono definiu; se não definiu, 30% do preço pra data distante.
        // Só cobra se o Stripe estiver configurado (senão segue sem sinal).
        const farFuture = startAt.getTime() > Date.now() + FAR_FUTURE_DAYS * 86_400_000;
        let deposit: number | null = null;
        if ((business.requireDeposit || farFuture) && this.stripe.enabled) {
          deposit =
            business.depositCents && business.depositCents > 0
              ? business.depositCents
              : farFuture
                ? Math.round(service.priceCents * FAR_FUTURE_DEPOSIT_PCT)
                : null;
          if (!deposit || deposit <= 0) deposit = null;
        }

        const appointment = await tx.appointment.create({
          data: {
            businessId,
            customerId,
            professionalId,
            serviceId,
            startAt,
            endAt,
            notes,
            status: deposit ? 'PENDING' : 'CONFIRMED',
            paymentStatus: deposit ? 'PENDING' : 'NONE',
            depositCents: deposit,
            holdExpiresAt: deposit ? new Date(Date.now() + HOLD_MINUTES * 60_000) : null,
          },
          include: { service: true, professional: true, customer: true },
        });

        return { appointment, slug: business.slug, deposit };
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

  async cancelAppointment(businessId: string, appointmentId: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
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
