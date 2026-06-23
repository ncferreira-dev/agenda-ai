import { BadRequestException, Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { BookingService } from '../booking/booking.service';

export interface AppointmentsQuery {
  from?: string; // ISO; default = agora
  to?: string; // ISO; opcional (fim da janela)
  status?: string; // um AppointmentStatus; default = PENDING+CONFIRMED
}

// Service do painel do dono. Todo método recebe businessId como 1º argumento e
// filtra por ele — mesmo padrão do BookingService. O businessId vem do JWT.
@Injectable()
export class PanelService {
  constructor(
    private prisma: PrismaService,
    private booking: BookingService,
  ) {}

  /** Dados do negócio do dono logado. */
  getBusiness(businessId: string) {
    return this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { id: true, name: true, slug: true, timezone: true, phone: true },
    });
  }

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

    const status = this.parseStatus(query.status);

    const appts = await this.prisma.appointment.findMany({
      where: { businessId, status, startAt },
      orderBy: { startAt: 'asc' },
      include: {
        service: { select: { name: true } },
        professional: { select: { name: true } },
        customer: { select: { name: true, phone: true } },
      },
    });

    return appts.map((a) => ({
      id: a.id,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      status: a.status,
      service: a.service.name,
      professional: a.professional.name,
      customer: { name: a.customer.name, phone: a.customer.phone },
    }));
  }

  /** Cancela um agendamento do negócio. Reusa o BookingService (já scopa). */
  cancel(businessId: string, appointmentId: string) {
    return this.booking.cancelAppointment(businessId, appointmentId);
  }

  // Default: agendamentos ativos. Se vier status, valida contra o enum.
  private parseStatus(status?: string): Prisma.EnumAppointmentStatusFilter {
    if (!status) {
      return { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] };
    }
    if (!(status in AppointmentStatus)) {
      throw new BadRequestException(`status inválido: ${status}`);
    }
    return { equals: status as AppointmentStatus };
  }
}
