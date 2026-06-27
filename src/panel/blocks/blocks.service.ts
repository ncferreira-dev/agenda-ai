import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';

export interface BlockInput {
  startAt: string; // ISO com offset
  endAt: string; // ISO com offset
  reason?: string;
  professionalId?: string; // null/ausente = bloqueia o negócio todo
}

export interface RecurringBlockInput {
  weekday: number; // 0 = domingo ... 6 = sábado
  start: string; // 'HH:mm' no fuso do negócio
  end: string; // 'HH:mm' no fuso do negócio
  reason?: string;
  professionalId?: string; // null/ausente = bloqueia o negócio todo
}

// 'HH:mm' -> minutos desde 00:00. Devolve null se inválido.
function parseMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

@Injectable()
export class BlocksService {
  constructor(private prisma: PrismaService) {}

  list(businessId: string) {
    return this.prisma.timeBlock.findMany({
      where: { businessId },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        reason: true,
        professionalId: true,
      },
    });
  }

  async create(businessId: string, input: BlockInput) {
    const start = DateTime.fromISO(input?.startAt ?? '');
    const end = DateTime.fromISO(input?.endAt ?? '');
    if (!start.isValid || !end.isValid) {
      throw new BadRequestException('startAt e endAt devem ser ISO válidos.');
    }
    if (end <= start) {
      throw new BadRequestException('endAt deve ser depois de startAt.');
    }

    // Se for bloqueio de um profissional, ele precisa ser do negócio.
    if (input.professionalId) {
      const pro = await this.prisma.professional.findFirst({
        where: { id: input.professionalId, businessId },
        select: { id: true },
      });
      if (!pro) throw new BadRequestException('Profissional não pertence ao negócio.');
    }

    return this.prisma.timeBlock.create({
      data: {
        businessId,
        professionalId: input.professionalId ?? null,
        startAt: start.toUTC().toJSDate(),
        endAt: end.toUTC().toJSDate(),
        reason: input.reason?.trim() || null,
      },
      select: { id: true, startAt: true, endAt: true, reason: true, professionalId: true },
    });
  }

  async remove(businessId: string, id: string) {
    const found = await this.prisma.timeBlock.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Bloqueio não encontrado.');
    await this.prisma.timeBlock.delete({ where: { id } });
    return { id, removed: true };
  }

  // --- Bloqueios recorrentes (repetem toda semana no mesmo dia/horário) -------

  listRecurring(businessId: string) {
    return this.prisma.recurringBlock.findMany({
      where: { businessId },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      select: {
        id: true,
        weekday: true,
        startMinute: true,
        endMinute: true,
        reason: true,
        professionalId: true,
      },
    });
  }

  async createRecurring(businessId: string, input: RecurringBlockInput) {
    const weekday = Number(input?.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new BadRequestException('Dia da semana inválido (0=domingo … 6=sábado).');
    }
    const startMinute = parseMinutes(input?.start);
    const endMinute = parseMinutes(input?.end);
    if (startMinute === null || endMinute === null) {
      throw new BadRequestException('Horários devem estar no formato HH:mm.');
    }
    if (endMinute <= startMinute) {
      throw new BadRequestException('O fim deve ser depois do início.');
    }

    if (input.professionalId) {
      const pro = await this.prisma.professional.findFirst({
        where: { id: input.professionalId, businessId },
        select: { id: true },
      });
      if (!pro) throw new BadRequestException('Profissional não pertence ao negócio.');
    }

    return this.prisma.recurringBlock.create({
      data: {
        businessId,
        professionalId: input.professionalId ?? null,
        weekday,
        startMinute,
        endMinute,
        reason: input.reason?.trim() || null,
      },
      select: {
        id: true,
        weekday: true,
        startMinute: true,
        endMinute: true,
        reason: true,
        professionalId: true,
      },
    });
  }

  async removeRecurring(businessId: string, id: string) {
    const found = await this.prisma.recurringBlock.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Bloqueio recorrente não encontrado.');
    await this.prisma.recurringBlock.delete({ where: { id } });
    return { id, removed: true };
  }
}
