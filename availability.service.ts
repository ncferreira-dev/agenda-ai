import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeAvailableSlots,
  formatSlot,
  type BusyInterval,
  type WorkingInterval,
  type Slot,
} from './slot-engine';

export interface ProfessionalAvailability {
  professionalId: string;
  professionalName: string;
  slots: { startAt: Date; label: string }[];
}

@Injectable()
export class AvailabilityService {
  constructor(private prisma: PrismaService) {}

  /**
   * Horários livres pra um serviço num dia.
   * Se professionalId vier, calcula só dele; senão, varre todos que executam o serviço.
   */
  async getAvailability(params: {
    businessId: string;
    serviceId: string;
    date: string; // 'YYYY-MM-DD' no fuso do negócio
    professionalId?: string;
  }): Promise<ProfessionalAvailability[]> {
    const { businessId, serviceId, date, professionalId } = params;

    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const service = await this.prisma.service.findUniqueOrThrow({
      where: { id: serviceId },
    });

    // Profissionais candidatos: os que executam o serviço (e estão ativos).
    const links = await this.prisma.professionalService.findMany({
      where: {
        serviceId,
        professional: {
          businessId,
          active: true,
          ...(professionalId ? { id: professionalId } : {}),
        },
      },
      include: { professional: true },
    });

    // Janela de busca do dia em UTC, p/ buscar ocupações de forma barata.
    const dayStart = DateTime.fromISO(date, { zone: business.timezone }).startOf('day');
    const dayEnd = dayStart.plus({ days: 1 });
    const windowStart = dayStart.toJSDate();
    const windowEnd = dayEnd.toJSDate();

    const result: ProfessionalAvailability[] = [];

    for (const link of links) {
      const pro = link.professional;

      const workingHours: WorkingInterval[] = (
        await this.prisma.workingHour.findMany({ where: { professionalId: pro.id } })
      ).map((w) => ({
        weekday: w.weekday,
        startMinute: w.startMinute,
        endMinute: w.endMinute,
      }));

      // Agendamentos ativos do profissional naquele dia.
      const appts = await this.prisma.appointment.findMany({
        where: {
          professionalId: pro.id,
          status: { in: ['PENDING', 'CONFIRMED'] },
          startAt: { lt: windowEnd },
          endAt: { gt: windowStart },
        },
        select: { startAt: true, endAt: true },
      });

      // Bloqueios do profissional + bloqueios do negócio inteiro.
      const blocks = await this.prisma.timeBlock.findMany({
        where: {
          businessId,
          OR: [{ professionalId: pro.id }, { professionalId: null }],
          startAt: { lt: windowEnd },
          endAt: { gt: windowStart },
        },
        select: { startAt: true, endAt: true },
      });

      const busy: BusyInterval[] = [...appts, ...blocks];

      const slots: Slot[] = computeAvailableSlots({
        date,
        timezone: business.timezone,
        durationMinutes: service.durationMinutes,
        slotStepMinutes: business.slotStepMinutes,
        minLeadMinutes: business.minLeadMinutes,
        workingHours,
        busy,
      });

      result.push({
        professionalId: pro.id,
        professionalName: pro.name,
        slots: slots.map((s) => ({
          startAt: s.startAt,
          label: formatSlot(s, business.timezone),
        })),
      });
    }

    return result;
  }
}
