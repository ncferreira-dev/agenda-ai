import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';

export interface BlockInput {
  startAt: string; // ISO com offset
  endAt: string; // ISO com offset
  reason?: string;
  professionalId?: string; // null/ausente = bloqueia o negócio todo
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
}
