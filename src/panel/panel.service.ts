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

  private static readonly BUSINESS_SELECT = {
    id: true,
    name: true,
    slug: true,
    timezone: true,
    phone: true,
    logoUrl: true,
    coverUrl: true,
    accentColor: true,
    about: true,
    instagramUrl: true,
    requireDeposit: true,
    depositCents: true,
  } as const;

  /** Dados do negócio do dono logado (inclui branding). */
  getBusiness(businessId: string) {
    return this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: PanelService.BUSINESS_SELECT,
    });
  }

  /** Atualiza dados/branding do negócio. Só os campos enviados são tocados. */
  async updateBusiness(
    businessId: string,
    input: {
      name?: string;
      accentColor?: string;
      about?: string;
      instagramUrl?: string;
      logoUrl?: string;
      coverUrl?: string;
      requireDeposit?: boolean;
      depositCents?: number | null;
    },
  ) {
    const data: Record<string, unknown> = {};

    if (input.requireDeposit !== undefined) data.requireDeposit = Boolean(input.requireDeposit);
    if (input.depositCents !== undefined) {
      if (input.depositCents === null) {
        data.depositCents = null;
      } else if (!Number.isInteger(input.depositCents) || input.depositCents < 0) {
        throw new BadRequestException('O valor do sinal deve ser um inteiro em centavos (>= 0).');
      } else {
        data.depositCents = input.depositCents;
      }
    }

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('O nome não pode ficar vazio.');
      data.name = name;
    }
    if (input.accentColor !== undefined) {
      data.accentColor = this.normalizeColor(input.accentColor);
    }
    if (input.about !== undefined) {
      const about = input.about.trim();
      if (about.length > 800) throw new BadRequestException('O "Sobre" está muito longo (máx. 800).');
      data.about = about || null;
    }
    if (input.instagramUrl !== undefined) data.instagramUrl = this.normalizeUrl(input.instagramUrl);
    if (input.logoUrl !== undefined) data.logoUrl = this.normalizeUrl(input.logoUrl);
    if (input.coverUrl !== undefined) data.coverUrl = this.normalizeUrl(input.coverUrl);

    return this.prisma.business.update({
      where: { id: businessId },
      data,
      select: PanelService.BUSINESS_SELECT,
    });
  }

  // Hex "#RRGGBB"; vazio limpa (null).
  private normalizeColor(value: string): string | null {
    const v = value.trim();
    if (!v) return null;
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
      throw new BadRequestException('Cor inválida. Use hex no formato #RRGGBB.');
    }
    return v.toUpperCase();
  }

  // URL http(s); vazio limpa (null).
  private normalizeUrl(value: string): string | null {
    const v = value.trim();
    if (!v) return null;
    if (!/^https?:\/\//.test(v)) {
      throw new BadRequestException('URL inválida (precisa começar com http).');
    }
    return v;
  }

  // --- Perfil do dono ----------------------------------------------------

  private static readonly OWNER_SELECT = {
    id: true,
    email: true,
    name: true,
    phone: true,
    cpf: true,
    cep: true,
    photoUrl: true,
  } as const;

  getOwner(ownerId: string) {
    return this.prisma.owner.findUniqueOrThrow({
      where: { id: ownerId },
      select: PanelService.OWNER_SELECT,
    });
  }

  async updateOwner(
    ownerId: string,
    input: {
      name?: string;
      phone?: string;
      cpf?: string;
      cep?: string;
      photoUrl?: string;
    },
  ) {
    const data: Record<string, unknown> = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('O nome não pode ficar vazio.');
      data.name = name;
    }
    if (input.phone !== undefined) data.phone = this.normalizePhone(input.phone);
    if (input.cep !== undefined) data.cep = this.normalizeCep(input.cep);
    if (input.cpf !== undefined) data.cpf = this.normalizeCpf(input.cpf);
    if (input.photoUrl !== undefined) data.photoUrl = this.normalizeUrl(input.photoUrl);

    return this.prisma.owner.update({
      where: { id: ownerId },
      data,
      select: PanelService.OWNER_SELECT,
    });
  }

  private normalizePhone(value: string): string | null {
    const digits = value.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length < 10 || digits.length > 13) {
      throw new BadRequestException('Telefone inválido.');
    }
    return digits.startsWith('55') ? digits : `55${digits}`;
  }

  private normalizeCep(value: string): string | null {
    const digits = value.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length !== 8) throw new BadRequestException('CEP deve ter 8 dígitos.');
    return digits;
  }

  // Valida CPF (11 dígitos + dígitos verificadores). Vazio limpa (null).
  private normalizeCpf(value: string): string | null {
    const cpf = value.replace(/\D/g, '');
    if (!cpf) return null;
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
      throw new BadRequestException('CPF inválido.');
    }
    const calcDigit = (len: number): number => {
      let sum = 0;
      for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    };
    if (calcDigit(9) !== Number(cpf[9]) || calcDigit(10) !== Number(cpf[10])) {
      throw new BadRequestException('CPF inválido.');
    }
    return cpf;
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
      paymentStatus: a.paymentStatus,
      confirmedByCustomer: a.customerConfirmedAt !== null,
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
