import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    address: true,
    slotStepMinutes: true,
    minLeadMinutes: true,
    maxAdvanceDays: true,
    reminderHoursBefore: true,
    logoUrl: true,
    coverUrl: true,
    accentColor: true,
    about: true,
    instagramUrl: true,
    requireDeposit: true,
    depositCents: true,
  } as const;

  // Fusos suportados (Brasil). Evita gravar timezone inválido (quebraria o motor).
  private static readonly TIMEZONES = [
    'America/Sao_Paulo',
    'America/Bahia',
    'America/Fortaleza',
    'America/Recife',
    'America/Manaus',
    'America/Cuiaba',
    'America/Campo_Grande',
    'America/Belem',
    'America/Rio_Branco',
    'America/Noronha',
  ];

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
      phone?: string;
      address?: string;
      timezone?: string;
      slotStepMinutes?: number;
      minLeadMinutes?: number;
      maxAdvanceDays?: number;
      reminderHoursBefore?: number;
    },
  ) {
    const data: Record<string, unknown> = {};

    if (input.reminderHoursBefore !== undefined) {
      data.reminderHoursBefore = this.requireRange(input.reminderHoursBefore, 1, 168, 'lembrete (horas)');
    }

    if (input.address !== undefined) {
      const address = input.address.trim();
      if (address.length > 200) throw new BadRequestException('Endereço muito longo (máx. 200).');
      data.address = address || null;
    }
    if (input.phone !== undefined) {
      const digits = input.phone.replace(/\D/g, '');
      data.phone = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : null;
    }
    if (input.timezone !== undefined) {
      if (!PanelService.TIMEZONES.includes(input.timezone)) {
        throw new BadRequestException('Fuso horário inválido.');
      }
      data.timezone = input.timezone;
    }
    if (input.slotStepMinutes !== undefined) {
      data.slotStepMinutes = this.requireRange(input.slotStepMinutes, 5, 120, 'passo dos horários');
    }
    if (input.minLeadMinutes !== undefined) {
      data.minLeadMinutes = this.requireRange(input.minLeadMinutes, 0, 10080, 'antecedência mínima');
    }
    if (input.maxAdvanceDays !== undefined) {
      data.maxAdvanceDays = this.requireRange(input.maxAdvanceDays, 1, 365, 'janela de agendamento');
    }

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

  private requireRange(value: number, min: number, max: number, label: string): number {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new BadRequestException(`Valor de ${label} deve ser um inteiro entre ${min} e ${max}.`);
    }
    return value;
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
        service: { select: { name: true, priceCents: true } },
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
      priceCents: a.service.priceCents,
      professional: a.professional.name,
      customer: { name: a.customer.name, phone: a.customer.phone },
    }));
  }

  /** Cancela um agendamento do negócio. Reusa o BookingService (já scopa). */
  cancel(businessId: string, appointmentId: string) {
    return this.booking.cancelAppointment(businessId, appointmentId);
  }

  /** Lista os clientes do negócio com contagem de agendamentos e o último. */
  async listCustomers(businessId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        ownerNote: true,
        _count: { select: { appointments: true } },
        appointments: { select: { startAt: true }, orderBy: { startAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    return customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      ownerNote: c.ownerNote,
      totalAppointments: c._count.appointments,
      lastAt: c.appointments[0]?.startAt.toISOString() ?? null,
    }));
  }

  /** Salva a observação privada do dono sobre um cliente (scoped por negócio). */
  async updateCustomerNote(businessId: string, customerId: string, note: string) {
    const found = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Cliente não encontrado.');
    const trimmed = note.trim();
    if (trimmed.length > 500) throw new BadRequestException('Observação muito longa (máx. 500).');
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { ownerNote: trimmed || null },
      select: { id: true, ownerNote: true },
    });
  }

  /** Marca o atendimento como concluído ou falta (no-show). */
  async setAppointmentStatus(businessId: string, id: string, status: 'COMPLETED' | 'NO_SHOW') {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!appt) throw new NotFoundException('Agendamento não encontrado.');
    return this.prisma.appointment.update({ where: { id }, data: { status } });
  }

  /**
   * Relatório de faturamento num período [from, to). Conta agendamentos ativos
   * (CONFIRMED/COMPLETED), separa realizado (passado) de previsto (futuro) e
   * quebra por serviço e por profissional.
   */
  async getRevenueReport(businessId: string, from: Date, to: Date) {
    const appts = await this.prisma.appointment.findMany({
      where: {
        businessId,
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        startAt: { gte: from, lt: to },
      },
      select: {
        startAt: true,
        service: { select: { name: true, priceCents: true } },
        professional: { select: { name: true } },
      },
    });

    const now = new Date();
    let totalCents = 0;
    let realizedCents = 0;
    const byService = new Map<string, { count: number; cents: number }>();
    const byProfessional = new Map<string, { count: number; cents: number }>();
    const bump = (m: Map<string, { count: number; cents: number }>, key: string, cents: number) => {
      const cur = m.get(key) ?? { count: 0, cents: 0 };
      cur.count += 1;
      cur.cents += cents;
      m.set(key, cur);
    };

    for (const a of appts) {
      const cents = a.service.priceCents;
      totalCents += cents;
      if (a.startAt < now) realizedCents += cents;
      bump(byService, a.service.name, cents);
      bump(byProfessional, a.professional.name, cents);
    }

    const toList = (m: Map<string, { count: number; cents: number }>) =>
      [...m.entries()]
        .map(([name, v]) => ({ name, count: v.count, cents: v.cents }))
        .sort((a, b) => b.cents - a.cents);

    return {
      totalCount: appts.length,
      totalCents,
      realizedCents,
      scheduledCents: totalCents - realizedCents,
      byService: toList(byService),
      byProfessional: toList(byProfessional),
    };
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
