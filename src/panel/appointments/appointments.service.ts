import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingService } from '../../booking/booking.service';
import { parseStatus } from '../panel.utils';

export interface AppointmentsQuery {
  from?: string; // ISO; default = agora
  to?: string; // ISO; opcional (fim da janela)
  status?: string; // um AppointmentStatus; default = PENDING+CONFIRMED
}

// Agenda do negócio: listar, cobrar, marcar presença e cancelar.
// Todo método recebe businessId como 1º argumento e filtra por ele — o
// businessId vem do JWT, nunca do corpo da requisição.
//
// Nasceu do PanelService, que tinha 1028 linhas e cinco assuntos dentro.
@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private booking: BookingService,
  ) {}

  /**
   * Agendamentos DO negócio (não de um cliente). Sem filtro, lista os ativos
   * de agora pra frente (dia/semana é só estreitar from/to no painel).
   */
  async getAppointments(businessId: string, query: AppointmentsQuery = {}) {
    const startAt: Prisma.DateTimeFilter = {};
    if (query.from) {
      const from = DateTime.fromISO(query.from);
      if (!from.isValid) throw new BadRequestException('from inválido (use ISO).');
      startAt.gte = from.toUTC().toJSDate();
    } else {
      startAt.gte = new Date();
    }
    if (query.to) {
      const to = DateTime.fromISO(query.to);
      if (!to.isValid) throw new BadRequestException('to inválido (use ISO).');
      startAt.lt = to.toUTC().toJSDate();
    }

    const status = parseStatus(query.status);

    const appts = await this.prisma.appointment.findMany({
      where: { businessId, status, startAt },
      orderBy: { startAt: 'asc' },
      include: {
        service: { select: { name: true } },
        professional: { select: { name: true, phone: true, email: true } },
        customer: { select: { name: true, phone: true } },
        items: { select: { id: true, name: true, priceCents: true }, orderBy: { createdAt: 'asc' } },
      },
    });

    return appts.map((a) => ({
      id: a.id,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      status: a.status,
      paid: a.manualPaidAt !== null,
      confirmedByCustomer: a.customerConfirmedAt !== null,
      service: a.service.name,
      totalCents: a.totalCents,
      items: a.items,
      professional: a.professional.name,
      // Pro botão manual "avisar no WhatsApp": telefone do profissional e se ele já
      // tem canal automático (e-mail). Não exponho o e-mail cru.
      professionalPhone: a.professional.phone,
      professionalHasEmail: a.professional.email !== null,
      customer: { name: a.customer.name, phone: a.customer.phone },
    }));
  }

  /**
   * Substitui os itens cobrados de um agendamento (serviço principal + extras)
   * e recalcula o totalCents — em transação. Só enquanto NÃO pago: depois de
   * pago o valor congela (não reescreve histórico financeiro). Escopo por negócio.
   */
  async setAppointmentItems(
    businessId: string,
    id: string,
    rawItems: Array<{ name?: string; priceCents?: number; sourceServiceId?: string | null }>,
  ) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, businessId },
      select: { id: true, manualPaidAt: true },
    });
    if (!appt) throw new NotFoundException('Agendamento não encontrado.');
    if (appt.manualPaidAt) {
      throw new BadRequestException('Agendamento já pago: os itens não podem mais ser editados.');
    }

    // Sanitiza: nome obrigatório, preço inteiro >= 0 em centavos.
    const items = (rawItems ?? []).map((it) => {
      const name = (it.name ?? '').trim();
      if (!name) throw new BadRequestException('Todo item precisa de um nome.');
      if (name.length > 80) throw new BadRequestException('Nome de item muito longo (máx. 80).');
      const price = it.priceCents;
      if (price === undefined || !Number.isInteger(price) || price < 0) {
        throw new BadRequestException('Preço do item deve ser um inteiro em centavos (>= 0).');
      }
      return { name, priceCents: price, sourceServiceId: it.sourceServiceId ?? null };
    });
    if (items.length === 0) {
      throw new BadRequestException('O agendamento precisa de ao menos um item.');
    }

    const total = items.reduce((s, it) => s + it.priceCents, 0);

    return this.prisma.$transaction(async (tx) => {
      await tx.appointmentItem.deleteMany({ where: { appointmentId: id } });
      await tx.appointmentItem.createMany({
        data: items.map((it) => ({ appointmentId: id, ...it })),
      });
      return tx.appointment.update({
        where: { id },
        data: { totalCents: total },
        select: { id: true, totalCents: true },
      });
    });
  }

  /** Cancela um agendamento do negócio. Reusa o BookingService (já scopa). */
  cancel(businessId: string, appointmentId: string) {
    return this.booking.cancelAppointment(businessId, appointmentId);
  }

  /**
   * Marca a presença: concluído, falta ou desfaz (volta a CONFIRMED). É a
   * presença — não confunda com o pagamento (setAppointmentPaid).
   */
  async setAppointmentStatus(
    businessId: string,
    id: string,
    status: 'COMPLETED' | 'NO_SHOW' | 'CONFIRMED',
  ) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!appt) throw new NotFoundException('Agendamento não encontrado.');
    return this.prisma.appointment.update({ where: { id }, data: { status } });
  }

  /**
   * Marca/desmarca o pagamento manual do dono. Estado SEPARADO da presença e do
   * sinal/Stripe (paymentStatus/paidAt) — só mexe em manualPaidAt.
   */
  async setAppointmentPaid(businessId: string, id: string, paid: boolean) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!appt) throw new NotFoundException('Agendamento não encontrado.');
    return this.prisma.appointment.update({
      where: { id },
      data: { manualPaidAt: paid ? new Date() : null },
    });
  }
}
