import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Service do painel do dono. Todo método recebe businessId como 1º argumento e
// filtra por ele — mesmo padrão do BookingService. O businessId vem do JWT.
@Injectable()
export class PanelService {
  constructor(private prisma: PrismaService) {}

  /** Dados do negócio do dono logado. */
  getBusiness(businessId: string) {
    return this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        phone: true,
      },
    });
  }

  /** Próximos agendamentos ativos DO negócio (não de um cliente). */
  async getUpcomingAppointments(businessId: string) {
    const appts = await this.prisma.appointment.findMany({
      where: {
        businessId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startAt: { gte: new Date() },
      },
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
      status: a.status,
      service: a.service.name,
      professional: a.professional.name,
      customer: { name: a.customer.name, phone: a.customer.phone },
    }));
  }
}
