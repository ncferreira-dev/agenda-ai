import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ServiceInput {
  name: string;
  durationMinutes: number;
  priceCents: number;
  followUpDays?: number | null; // null/ausente = sem follow-up
  followUpMessage?: string | null;
}

const SERVICE_SELECT = {
  id: true,
  name: true,
  durationMinutes: true,
  priceCents: true,
  active: true,
  followUpDays: true,
  followUpMessage: true,
} as const;

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
    const data = this.validate(input);
    return this.prisma.service.create({
      data: { businessId, ...data },
      select: SERVICE_SELECT,
    });
  }

  async update(businessId: string, id: string, input: Partial<ServiceInput> & { active?: boolean }) {
    await this.ensureOwned(businessId, id);
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = this.requireName(input.name);
    if (input.durationMinutes !== undefined) data.durationMinutes = this.requireDuration(input.durationMinutes);
    if (input.priceCents !== undefined) data.priceCents = this.requirePrice(input.priceCents);
    if (input.active !== undefined) data.active = Boolean(input.active);
    if (input.followUpDays !== undefined) data.followUpDays = this.normalizeFollowUpDays(input.followUpDays);
    if (input.followUpMessage !== undefined) data.followUpMessage = this.normalizeFollowUpMessage(input.followUpMessage);

    return this.prisma.service.update({
      where: { id },
      data,
      select: SERVICE_SELECT,
    });
  }

  /** Soft delete: Appointment referencia Service, então não apagamos de verdade. */
  async remove(businessId: string, id: string) {
    await this.ensureOwned(businessId, id);
    await this.prisma.service.update({ where: { id }, data: { active: false } });
    return { id, active: false };
  }

  // Garante que o serviço é deste negócio (impede escrita cross-tenant).
  private async ensureOwned(businessId: string, id: string) {
    const found = await this.prisma.service.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Serviço não encontrado.');
  }

  private validate(input: ServiceInput): ServiceInput {
    return {
      name: this.requireName(input.name),
      durationMinutes: this.requireDuration(input.durationMinutes),
      priceCents: this.requirePrice(input.priceCents),
      followUpDays: this.normalizeFollowUpDays(input.followUpDays),
      followUpMessage: this.normalizeFollowUpMessage(input.followUpMessage),
    };
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
