import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeEmail, normalizePhone } from '../panel.utils';
import { isValidCpf, normalizeCpf as normalizarCpf } from '../../common/cpf';

export interface ProfessionalInput {
  name: string;
  serviceIds?: string[];
  phone?: string;
  email?: string;
  cpf?: string;
  photoUrl?: string;
}

export interface WorkingHourInput {
  weekday: number; // 0 = domingo ... 6 = sábado
  startMinute: number; // minutos desde 00:00 no fuso do negócio
  endMinute: number;
}

const MINUTES_IN_DAY = 24 * 60;

@Injectable()
export class ProfessionalsService {
  constructor(private prisma: PrismaService) {}

  async list(businessId: string) {
    const pros = await this.prisma.professional.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        active: true,
        phone: true,
        email: true,
        cpf: true,
        photoUrl: true,
        services: { select: { serviceId: true } },
      },
    });
    return pros.map((p) => ({
      id: p.id,
      name: p.name,
      active: p.active,
      phone: p.phone,
      email: p.email,
      cpf: p.cpf,
      photoUrl: p.photoUrl,
      serviceIds: p.services.map((s) => s.serviceId),
    }));
  }

  async create(businessId: string, input: ProfessionalInput) {
    const name = this.requireName(input.name);
    const serviceIds = await this.validateServiceIds(businessId, input.serviceIds);

    const pro = await this.prisma.professional.create({
      data: {
        businessId,
        name,
        phone: normalizePhone(input.phone ?? '', 'Telefone do profissional'),
        email: normalizeEmail(input.email ?? ''),
        cpf: this.normalizeCpf(input.cpf),
        photoUrl: this.normalizeUrl(input.photoUrl),
        services: serviceIds.length
          ? { create: serviceIds.map((serviceId) => ({ serviceId })) }
          : undefined,
      },
      select: { id: true, name: true, active: true },
    });
    return { ...pro, serviceIds };
  }

  async update(
    businessId: string,
    id: string,
    input: Partial<ProfessionalInput> & { active?: boolean },
  ) {
    await this.ensureOwned(businessId, id);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = this.requireName(input.name);
    if (input.active !== undefined) data.active = Boolean(input.active);
    if (input.phone !== undefined)
      data.phone = normalizePhone(input.phone, 'Telefone do profissional');
    if (input.email !== undefined) data.email = normalizeEmail(input.email);
    if (input.cpf !== undefined) data.cpf = this.normalizeCpf(input.cpf);
    if (input.photoUrl !== undefined) data.photoUrl = this.normalizeUrl(input.photoUrl);

    // Se vier serviceIds, substitui o conjunto de vínculos por completo.
    if (input.serviceIds !== undefined) {
      const serviceIds = await this.validateServiceIds(businessId, input.serviceIds);
      await this.prisma.$transaction([
        this.prisma.professionalService.deleteMany({ where: { professionalId: id } }),
        this.prisma.professionalService.createMany({
          data: serviceIds.map((serviceId) => ({ professionalId: id, serviceId })),
        }),
      ]);
    }

    if (Object.keys(data).length) {
      await this.prisma.professional.update({ where: { id }, data });
    }
    return this.getOne(businessId, id);
  }

  /** Soft delete: Appointment referencia Professional. */
  async remove(businessId: string, id: string) {
    await this.ensureOwned(businessId, id);
    await this.prisma.professional.update({ where: { id }, data: { active: false } });
    return { id, active: false };
  }

  async getWorkingHours(businessId: string, professionalId: string) {
    await this.ensureOwned(businessId, professionalId);
    return this.prisma.workingHour.findMany({
      where: { professionalId },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      select: { id: true, weekday: true, startMinute: true, endMinute: true },
    });
  }

  /** Substitui a grade semanal inteira do profissional. */
  async setWorkingHours(businessId: string, professionalId: string, faixas: WorkingHourInput[]) {
    await this.ensureOwned(businessId, professionalId);
    const validas = this.validateWorkingHours(faixas);

    await this.prisma.$transaction([
      this.prisma.workingHour.deleteMany({ where: { professionalId } }),
      this.prisma.workingHour.createMany({
        data: validas.map((f) => ({ professionalId, ...f })),
      }),
    ]);
    return this.getWorkingHours(businessId, professionalId);
  }

  // -------------------------------------------------------------------------

  private async getOne(businessId: string, id: string) {
    const [pro] = await this.list(businessId).then((all) => all.filter((p) => p.id === id));
    if (!pro) throw new NotFoundException('Profissional não encontrado.');
    return pro;
  }

  private async ensureOwned(businessId: string, id: string) {
    const found = await this.prisma.professional.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Profissional não encontrado.');
  }

  private normalizeUrl(value?: string): string | null {
    if (value === undefined) return null;
    const v = value.trim();
    if (!v) return null;
    if (!/^https?:\/\//.test(v)) throw new BadRequestException('URL de foto inválida.');
    return v;
  }

  // Telefone, e-mail e CPF viviam copiados aqui dentro, com a mesma regra dos
  // comuns. Cópia de regra não fica igual sozinha — foi assim que a lista de
  // slugs reservados e o telefone do negócio divergiram. Agora só o CPF tem
  // método próprio, porque o comum devolve boolean e aqui a resposta é a
  // mensagem que o dono lê.
  //
  // O `?? ''` cobre o campo ausente: todos os normalizadores tratam vazio como
  // "limpa" (null). Havia um helper aqui só pra distinguir undefined de '', e
  // apagá-lo não mudou nenhum teste — os dois caminhos já davam no mesmo.
  private normalizeCpf(value?: string): string | null {
    const cpf = normalizarCpf(value ?? '');
    if (!cpf) return null;
    if (!isValidCpf(cpf)) throw new BadRequestException('CPF inválido.');
    return cpf;
  }

  private requireName(name: unknown): string {
    if (typeof name !== 'string' || !name.trim()) {
      throw new BadRequestException('Nome do profissional é obrigatório.');
    }
    return name.trim();
  }

  /** Garante que todo serviceId informado é do próprio negócio. */
  private async validateServiceIds(businessId: string, serviceIds?: string[]): Promise<string[]> {
    if (!serviceIds || serviceIds.length === 0) return [];
    const unicos = [...new Set(serviceIds)];
    const count = await this.prisma.service.count({
      where: { businessId, id: { in: unicos } },
    });
    if (count !== unicos.length) {
      throw new BadRequestException('Um ou mais serviços não pertencem ao negócio.');
    }
    return unicos;
  }

  private validateWorkingHours(faixas: unknown): WorkingHourInput[] {
    if (!Array.isArray(faixas)) {
      throw new BadRequestException('Envie uma lista de faixas de horário.');
    }
    return faixas.map((f) => {
      const { weekday, startMinute, endMinute } = (f ?? {}) as WorkingHourInput;
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        throw new BadRequestException('weekday deve ser 0 (domingo) a 6 (sábado).');
      }
      if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) {
        throw new BadRequestException('startMinute e endMinute devem ser inteiros.');
      }
      if (startMinute < 0 || endMinute > MINUTES_IN_DAY || startMinute >= endMinute) {
        throw new BadRequestException('Faixa inválida: exige 0 <= início < fim <= 1440.');
      }
      return { weekday, startMinute, endMinute };
    });
  }
}
