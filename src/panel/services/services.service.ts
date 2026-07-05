import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type DiscountKind = 'PERCENT' | 'FIXED';

export interface ServiceInput {
  name: string;
  durationMinutes: number; // ignorado quando isKit (a duração é a soma dos membros)
  priceCents: number;
  followUpDays?: number | null; // null/ausente = sem follow-up
  followUpMessage?: string | null;
  // Desconto ofertado ao cliente. kind null (ou value 0) = sem desconto.
  discountKind?: DiscountKind | null;
  discountValue?: number | null;
  // Kit/pacote: junta vários serviços num bloco só, com preço próprio.
  isKit?: boolean;
  kitMemberIds?: string[]; // ids dos serviços membros, na ordem de exibição
}

const SERVICE_SELECT = {
  id: true,
  name: true,
  durationMinutes: true,
  priceCents: true,
  active: true,
  followUpDays: true,
  followUpMessage: true,
  discountKind: true,
  discountValue: true,
  isKit: true,
  kitItems: {
    select: {
      memberServiceId: true,
      position: true,
      member: { select: { id: true, name: true, durationMinutes: true, priceCents: true } },
    },
    orderBy: { position: 'asc' },
  },
} as const;

// Client ou transação — os helpers de recálculo rodam dentro de $transaction.
type Db = PrismaClient | Prisma.TransactionClient;

// CRUD de serviços do negócio. businessId vem sempre do JWT (1º argumento).
@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  list(businessId: string) {
    return this.prisma.service.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
      select: SERVICE_SELECT,
    });
  }

  async create(businessId: string, input: ServiceInput) {
    const name = this.requireName(input.name);
    const priceCents = this.requirePrice(input.priceCents);
    const { discountKind, discountValue } = this.validateDiscount(input, priceCents);
    const followUpDays = this.normalizeFollowUpDays(input.followUpDays);
    const followUpMessage = this.normalizeFollowUpMessage(input.followUpMessage);

    if (input.isKit) {
      // Kit: a duração é a SOMA das durações dos membros (cacheada). O motor de
      // slots lê essa durationMinutes e trata o kit como um bloco único.
      const members = await this.validateKitMembers(businessId, input.kitMemberIds ?? []);
      const durationMinutes = members.reduce((s, m) => s + m.durationMinutes, 0);
      return this.prisma.service.create({
        data: {
          businessId,
          name,
          priceCents,
          durationMinutes,
          discountKind,
          discountValue,
          followUpDays,
          followUpMessage,
          isKit: true,
          kitItems: {
            create: members.map((m, i) => ({ memberServiceId: m.id, position: i })),
          },
        },
        select: SERVICE_SELECT,
      });
    }

    return this.prisma.service.create({
      data: {
        businessId,
        name,
        priceCents,
        durationMinutes: this.requireDuration(input.durationMinutes),
        discountKind,
        discountValue,
        followUpDays,
        followUpMessage,
      },
      select: SERVICE_SELECT,
    });
  }

  async update(businessId: string, id: string, input: Partial<ServiceInput> & { active?: boolean }) {
    const current = await this.ensureOwned(businessId, id);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = this.requireName(input.name);
    if (input.priceCents !== undefined) data.priceCents = this.requirePrice(input.priceCents);
    if (input.active !== undefined) data.active = Boolean(input.active);
    if (input.followUpDays !== undefined) data.followUpDays = this.normalizeFollowUpDays(input.followUpDays);
    if (input.followUpMessage !== undefined) data.followUpMessage = this.normalizeFollowUpMessage(input.followUpMessage);

    // Desconto: valida contra o preço que vai valer (novo, se veio; senão o atual).
    if (input.discountKind !== undefined || input.discountValue !== undefined) {
      const price = input.priceCents !== undefined ? this.requirePrice(input.priceCents) : current.priceCents;
      const { discountKind, discountValue } = this.validateDiscount(
        {
          discountKind: input.discountKind !== undefined ? input.discountKind : current.discountKind,
          discountValue: input.discountValue !== undefined ? input.discountValue : current.discountValue,
        },
        price,
      );
      data.discountKind = discountKind;
      data.discountValue = discountValue;
    }

    // Serviço comum: se a duração veio, valida e (se mudou) recalcula os kits que o contêm.
    if (!current.isKit && input.durationMinutes !== undefined) {
      data.durationMinutes = this.requireDuration(input.durationMinutes);
    }

    // Kit: se a composição veio, revalida os membros e recalcula a duração cacheada.
    const newMemberIds = current.isKit ? input.kitMemberIds : undefined;

    return this.prisma.$transaction(async (tx) => {
      if (current.isKit && newMemberIds !== undefined) {
        const members = await this.validateKitMembers(businessId, newMemberIds, id);
        data.durationMinutes = members.reduce((s, m) => s + m.durationMinutes, 0);
        await tx.kitItem.deleteMany({ where: { kitServiceId: id } });
        await tx.kitItem.createMany({
          data: members.map((m, i) => ({ kitServiceId: id, memberServiceId: m.id, position: i })),
        });
      }

      const updated = await tx.service.update({ where: { id }, data, select: SERVICE_SELECT });

      // Se a duração de um serviço COMUM mudou, os kits que o incluem ficam com a
      // soma desatualizada — recalcula cada um deles.
      if (!current.isKit && data.durationMinutes !== undefined && data.durationMinutes !== current.durationMinutes) {
        await this.recomputeKitsContaining(tx, id);
      }

      return updated;
    });
  }

  /** Soft delete: Appointment referencia Service, então não apagamos de verdade. */
  async remove(businessId: string, id: string) {
    await this.ensureOwned(businessId, id);
    await this.prisma.service.update({ where: { id }, data: { active: false } });
    return { id, active: false };
  }

  // Garante que o serviço é deste negócio (impede escrita cross-tenant). Devolve o
  // estado atual necessário pra decidir recálculos.
  private async ensureOwned(businessId: string, id: string) {
    const found = await this.prisma.service.findFirst({
      where: { id, businessId },
      select: { id: true, isKit: true, priceCents: true, durationMinutes: true, discountKind: true, discountValue: true },
    });
    if (!found) throw new NotFoundException('Serviço não encontrado.');
    return found;
  }

  // Recalcula a durationMinutes de todos os kits que incluem `memberServiceId`.
  private async recomputeKitsContaining(tx: Db, memberServiceId: string) {
    const affected = await tx.kitItem.findMany({
      where: { memberServiceId },
      select: { kitServiceId: true },
      distinct: ['kitServiceId'],
    });
    for (const { kitServiceId } of affected) {
      const items = await tx.kitItem.findMany({
        where: { kitServiceId },
        select: { member: { select: { durationMinutes: true } } },
      });
      const durationMinutes = items.reduce((s, it) => s + it.member.durationMinutes, 0);
      await tx.service.update({ where: { id: kitServiceId }, data: { durationMinutes } });
    }
  }

  // Valida a composição de um kit. Membros: do mesmo negócio, existentes, não-kits
  // (sem aninhamento) e nunca o próprio kit. Devolve na ordem informada (posição).
  private async validateKitMembers(
    businessId: string,
    memberIds: string[],
    selfId?: string,
  ): Promise<Array<{ id: string; durationMinutes: number }>> {
    const ordered = (memberIds ?? []).map((s) => String(s));
    const unique = [...new Set(ordered)];
    if (selfId && unique.includes(selfId)) {
      throw new BadRequestException('Um kit não pode incluir ele mesmo.');
    }
    if (unique.length < 2) {
      throw new BadRequestException('Um kit precisa de ao menos 2 serviços.');
    }
    const found = await this.prisma.service.findMany({
      where: { id: { in: unique }, businessId },
      select: { id: true, durationMinutes: true, isKit: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException('Algum serviço do kit não foi encontrado neste negócio.');
    }
    if (found.some((m) => m.isKit)) {
      throw new BadRequestException('Um kit não pode conter outro kit.');
    }
    const byId = new Map(found.map((m) => [m.id, m]));
    return unique.map((id) => {
      const m = byId.get(id)!;
      return { id: m.id, durationMinutes: m.durationMinutes };
    });
  }

  // Desconto: PERCENT 1–99; FIXED 1..priceCents (em centavos). kind null ou value
  // 0/ausente = sem desconto (normaliza pra kind null, value 0).
  private validateDiscount(
    input: { discountKind?: DiscountKind | null; discountValue?: number | null },
    priceCents: number,
  ): { discountKind: DiscountKind | null; discountValue: number } {
    const kind = input.discountKind ?? null;
    const rawValue = input.discountValue;

    if (!kind || rawValue === null || rawValue === undefined || rawValue === 0) {
      return { discountKind: null, discountValue: 0 };
    }
    if (!Number.isInteger(rawValue) || rawValue < 0) {
      throw new BadRequestException('Desconto inválido.');
    }
    if (kind === 'PERCENT') {
      if (rawValue < 1 || rawValue > 99) {
        throw new BadRequestException('Desconto em % deve ficar entre 1 e 99.');
      }
      return { discountKind: 'PERCENT', discountValue: rawValue };
    }
    // FIXED
    if (rawValue < 1 || rawValue > priceCents) {
      throw new BadRequestException('Desconto em R$ deve ser entre 1 centavo e o preço do serviço.');
    }
    return { discountKind: 'FIXED', discountValue: rawValue };
  }

  // Intervalo de follow-up: inteiro 1–365, ou null (sem follow-up).
  private normalizeFollowUpDays(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 365) {
      throw new BadRequestException('Follow-up: use um número de dias entre 1 e 365 (ou deixe vazio).');
    }
    return value as number;
  }

  // Mensagem de follow-up: texto até 500 chars, ou null (usa o template genérico).
  private normalizeFollowUpMessage(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') throw new BadRequestException('Mensagem de follow-up inválida.');
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length > 500) throw new BadRequestException('Mensagem de follow-up muito longa (máx. 500).');
    return trimmed;
  }

  private requireName(name: unknown): string {
    if (typeof name !== 'string' || !name.trim()) {
      throw new BadRequestException('Nome do serviço é obrigatório.');
    }
    return name.trim();
  }

  private requireDuration(min: unknown): number {
    if (!Number.isInteger(min) || (min as number) <= 0) {
      throw new BadRequestException('Duração deve ser um número de minutos positivo.');
    }
    return min as number;
  }

  private requirePrice(cents: unknown): number {
    if (!Number.isInteger(cents) || (cents as number) < 0) {
      throw new BadRequestException('Preço (em centavos) deve ser um inteiro >= 0.');
    }
    return cents as number;
  }
}
