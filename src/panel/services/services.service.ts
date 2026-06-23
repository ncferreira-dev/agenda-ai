import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ServiceInput {
  name: string;
  durationMinutes: number;
  priceCents: number;
}

// CRUD de serviços do negócio. businessId vem sempre do JWT (1º argumento).
@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  list(businessId: string) {
    return this.prisma.service.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, durationMinutes: true, priceCents: true, active: true },
    });
  }

  async create(businessId: string, input: ServiceInput) {
    const data = this.validate(input);
    return this.prisma.service.create({
      data: { businessId, ...data },
      select: { id: true, name: true, durationMinutes: true, priceCents: true, active: true },
    });
  }

  async update(businessId: string, id: string, input: Partial<ServiceInput> & { active?: boolean }) {
    await this.ensureOwned(businessId, id);
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = this.requireName(input.name);
    if (input.durationMinutes !== undefined) data.durationMinutes = this.requireDuration(input.durationMinutes);
    if (input.priceCents !== undefined) data.priceCents = this.requirePrice(input.priceCents);
    if (input.active !== undefined) data.active = Boolean(input.active);

    return this.prisma.service.update({
      where: { id },
      data,
      select: { id: true, name: true, durationMinutes: true, priceCents: true, active: true },
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
    };
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
