import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BookingService {
  constructor(private prisma: PrismaService) {}

  /** Acha o cliente pelo telefone ou cria. Atualiza o nome se vier. */
  async findOrCreateCustomer(businessId: string, phone: string, name?: string) {
    return this.prisma.customer.upsert({
      where: { businessId_phone: { businessId, phone } },
      create: { businessId, phone, name },
      update: name ? { name } : {},
    });
  }

  /**
   * Cria o agendamento. Revalida o slot DENTRO de uma transação pra não
   * permitir overbooking. startAtIso deve ser um instante ISO (com offset)
   * que veio de um slot ofertado pelo motor de disponibilidade.
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

    return this.prisma.$transaction(async (tx) => {
      const service = await tx.service.findUniqueOrThrow({ where: { id: serviceId } });
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

      return tx.appointment.create({
        data: {
          businessId,
          customerId,
          professionalId,
          serviceId,
          startAt,
          endAt,
          notes,
          status: 'CONFIRMED',
        },
        include: { service: true, professional: true },
      });
    });
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
