import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma, ServiceMode } from '@prisma/client';
import * as argon2 from 'argon2';
import { DateTime } from 'luxon';
import { hashCpf, normalizeCpf } from '../common/cpf';
import { PrismaService } from '../prisma/prisma.service';
import { BookingService } from '../booking/booking.service';
import { renderFollowUpMessage } from '../follow-up/render-message';
import { VERTICAL_PRESETS, getVertical, isSkinId, SKINS } from '../presets/verticais';

export interface AppointmentsQuery {
  from?: string; // ISO; default = agora
  to?: string; // ISO; opcional (fim da janela)
  status?: string; // um AppointmentStatus; default = PENDING+CONFIRMED
}

// Números de CRM acumulados por cliente.
interface CustomerStats {
  total: number; // agendamentos não cancelados
  visits: number; // atendimentos concluídos (COMPLETED)
  paidCount: number; // atendimentos pagos
  spentCents: number; // total gasto (soma dos pagos, total editado)
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
}

const EMPTY_STATS: CustomerStats = {
  total: 0,
  visits: 0,
  paidCount: 0,
  spentCents: 0,
  firstVisitAt: null,
  lastVisitAt: null,
};

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
    serviceMode: true,
    meetingUrl: true,
    slotStepMinutes: true,
    minLeadMinutes: true,
    maxAdvanceDays: true,
    reminderHoursBefore: true,
    logoUrl: true,
    coverUrl: true,
    accentColor: true,
    about: true,
    instagramUrl: true,
    profession: true,
    themePreset: true,
    onboardedAt: true,
    inactiveDays: true,
    vipMinSpentCents: true,
    recurringMinVisits: true,
    notifyWhatsApp: true,
    notifyEmail: true,
    notifyPush: true,
    notifyOwnerAllBookings: true,
    notifyDailySummary: true,
    ownerWhatsApp: true,
    ownerEmail: true,
    plan: true,
    subscriptionStatus: true,
    trialEndsAt: true,
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
      slug?: string;
      accentColor?: string;
      about?: string;
      instagramUrl?: string;
      profession?: string;
      themePreset?: string;
      logoUrl?: string;
      coverUrl?: string;
      notifyWhatsApp?: boolean;
      notifyEmail?: boolean;
      notifyPush?: boolean;
      notifyOwnerAllBookings?: boolean;
      notifyDailySummary?: boolean;
      ownerWhatsApp?: string;
      ownerEmail?: string;
      phone?: string;
      address?: string;
      serviceMode?: string;
      meetingUrl?: string;
      timezone?: string;
      slotStepMinutes?: number;
      minLeadMinutes?: number;
      maxAdvanceDays?: number;
      reminderHoursBefore?: number;
      inactiveDays?: number;
      vipMinSpentCents?: number | null;
      recurringMinVisits?: number;
    },
  ) {
    const data: Record<string, unknown> = {};

    if (input.inactiveDays !== undefined) {
      data.inactiveDays = this.requireRange(input.inactiveDays, 7, 730, 'dias para "sumido"');
    }
    if (input.recurringMinVisits !== undefined) {
      data.recurringMinVisits = this.requireRange(input.recurringMinVisits, 2, 100, 'visitas para "recorrente"');
    }
    if (input.vipMinSpentCents !== undefined) {
      if (input.vipMinSpentCents === null) {
        data.vipMinSpentCents = null;
      } else if (!Number.isInteger(input.vipMinSpentCents) || input.vipMinSpentCents < 0) {
        throw new BadRequestException('O gasto mínimo de VIP deve ser um inteiro em centavos (>= 0).');
      } else {
        data.vipMinSpentCents = input.vipMinSpentCents;
      }
    }

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

    if (input.notifyWhatsApp !== undefined) data.notifyWhatsApp = Boolean(input.notifyWhatsApp);
    if (input.notifyEmail !== undefined) data.notifyEmail = Boolean(input.notifyEmail);
    if (input.notifyPush !== undefined) data.notifyPush = Boolean(input.notifyPush);
    if (input.notifyOwnerAllBookings !== undefined) data.notifyOwnerAllBookings = Boolean(input.notifyOwnerAllBookings);
    if (input.notifyDailySummary !== undefined) data.notifyDailySummary = Boolean(input.notifyDailySummary);
    if (input.ownerWhatsApp !== undefined) data.ownerWhatsApp = this.normalizePhone(input.ownerWhatsApp);
    if (input.ownerEmail !== undefined) data.ownerEmail = this.normalizeEmail(input.ownerEmail);

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('O nome não pode ficar vazio.');
      data.name = name;
    }
    if (input.slug !== undefined) {
      data.slug = await this.normalizeSlug(input.slug, businessId);
    }
    if (input.accentColor !== undefined) {
      data.accentColor = this.normalizeColor(input.accentColor);
    }
    if (input.about !== undefined) {
      const about = input.about.trim();
      if (about.length > 800) throw new BadRequestException('O "Sobre" está muito longo (máx. 800).');
      data.about = about || null;
    }
    if (input.profession !== undefined) {
      const profession = input.profession.trim();
      if (profession.length > 80) throw new BadRequestException('Profissão muito longa (máx. 80).');
      data.profession = profession || null;
    }
    if (input.themePreset !== undefined) {
      const v = input.themePreset.trim();
      if (v && !isSkinId(v)) throw new BadRequestException('Tema inválido.');
      data.themePreset = v || null;
    }
    if (input.instagramUrl !== undefined) data.instagramUrl = this.normalizeUrl(input.instagramUrl);
    if (input.logoUrl !== undefined) data.logoUrl = this.normalizeUrl(input.logoUrl);
    if (input.coverUrl !== undefined) data.coverUrl = this.normalizeUrl(input.coverUrl);

    // Link de atendimento online: aceita sem esquema (recebe https://); vazio limpa.
    if (input.meetingUrl !== undefined) {
      const v = input.meetingUrl.trim();
      data.meetingUrl = v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null;
    }
    // Tipo de atendimento. Aplico o ripple por ÚLTIMO pra sobrepor address/meetingUrl:
    // remoto zera o endereço; presencial zera o link de atendimento.
    if (input.serviceMode !== undefined) {
      const m = input.serviceMode;
      if (m !== ServiceMode.PRESENCIAL && m !== ServiceMode.REMOTO && m !== ServiceMode.HIBRIDO) {
        throw new BadRequestException('Tipo de atendimento inválido.');
      }
      data.serviceMode = m;
      if (m === ServiceMode.REMOTO) data.address = null;
      if (m === ServiceMode.PRESENCIAL) data.meetingUrl = null;
    }

    try {
      return await this.prisma.business.update({
        where: { id: businessId },
        data,
        select: PanelService.BUSINESS_SELECT,
      });
    } catch (e) {
      // Backstop de corrida: o @unique do slug pegou uma colisão simultânea.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Esse link já está em uso. Escolha outro.');
      }
      throw e;
    }
  }

  // --- Onboarding "qual é o seu negócio?" (Fase 3b) ----------------------

  /** Catálogo de verticais + peles pro wizard renderizar os cards. É config estática. */
  getVerticais() {
    return { verticais: VERTICAL_PRESETS, skins: SKINS };
  }

  /**
   * Aplica um vertical no negócio: seta profissão/cor/tema sugeridos e cria os
   * serviços-base (pulando os que já existem por nome, pra ser idempotente).
   * NÃO fecha o onboarding — isso é o passo 2 (finishOnboarding). Escopo por negócio.
   */
  async applyVertical(businessId: string, verticalId: string, skinId?: string) {
    const preset = getVertical(verticalId);
    if (!preset) throw new BadRequestException('Vertical inválido.');
    const skin = skinId && isSkinId(skinId) ? skinId : preset.temaSugerido;

    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        profession: preset.label,
        accentColor: preset.accentColor,
        themePreset: skin,
      },
    });

    // Cria só os serviços cujo nome ainda não existe (case-insensitive) neste
    // negócio — reaplicar não duplica e não mexe no que o dono já editou.
    const existentes = await this.prisma.service.findMany({
      where: { businessId },
      select: { name: true },
    });
    const jaTem = new Set(existentes.map((s) => s.name.trim().toLowerCase()));
    const novos = preset.servicosBase.filter((s) => !jaTem.has(s.name.trim().toLowerCase()));
    if (novos.length > 0) {
      await this.prisma.service.createMany({
        data: novos.map((s) => ({ businessId, ...s })),
      });
    }

    return { created: novos.length, skipped: preset.servicosBase.length - novos.length };
  }

  /** Marca o onboarding como concluído (também usado pelo "pular por agora"). */
  async finishOnboarding(businessId: string) {
    await this.prisma.business.update({
      where: { id: businessId },
      data: { onboardedAt: new Date() },
    });
    return { onboarded: true };
  }

  // Slugs reservados: colidiriam com rotas do app/site (Next + API pública).
  private static readonly RESERVED_SLUGS = new Set([
    'painel', 'login', 'logout', 'cadastro', 'api', 'b', 'admin', 'app',
    'www', 'sobre', 'precos', 'termos', 'privacidade', 'contato', 'ajuda',
    'negocio', 'agendamento', 'agendar', 'static', '_next', 'assets',
  ]);

  // Slug da página pública: minúsculas, [a-z0-9-], sem hífen nas pontas/duplo,
  // 3–40 chars. Checa unicidade contra TODOS os negócios (exceto o próprio).
  private async normalizeSlug(value: string, businessId: string): Promise<string> {
    const slug = value.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new BadRequestException(
        'O link só pode ter letras minúsculas, números e hífen (sem espaços nem acentos).',
      );
    }
    if (slug.length < 3 || slug.length > 40) {
      throw new BadRequestException('O link deve ter entre 3 e 40 caracteres.');
    }
    if (PanelService.RESERVED_SLUGS.has(slug)) {
      throw new BadRequestException('Esse link é reservado. Escolha outro.');
    }
    const clash = await this.prisma.business.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (clash && clash.id !== businessId) {
      throw new ConflictException('Esse link já está em uso. Escolha outro.');
    }
    return slug;
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

  // E-mail simples; vazio limpa (null).
  private normalizeEmail(value: string): string | null {
    const v = value.trim().toLowerCase();
    if (!v) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      throw new BadRequestException('E-mail inválido.');
    }
    return v;
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

  // Nunca selecionamos cpfHash pra fora: o CPF é write-only. A página só sabe
  // se há um cadastrado (hasCpf), nunca o número.
  private static readonly OWNER_SELECT = {
    id: true,
    email: true,
    name: true,
    phone: true,
    cpfHash: true,
    passwordHash: true,
    cep: true,
    photoUrl: true,
  } as const;

  // Tira cpfHash/passwordHash do retorno (write-only) e expõe só os booleanos:
  // hasCpf e hasPassword (contas nascidas por login social não têm senha).
  private presentOwner<T extends { cpfHash: string | null; passwordHash: string | null }>(
    owner: T,
  ) {
    const { cpfHash, passwordHash, ...rest } = owner;
    return { ...rest, hasCpf: cpfHash !== null, hasPassword: passwordHash !== null };
  }

  async getOwner(ownerId: string) {
    const owner = await this.prisma.owner.findUniqueOrThrow({
      where: { id: ownerId },
      select: PanelService.OWNER_SELECT,
    });
    return this.presentOwner(owner);
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
    if (input.photoUrl !== undefined) data.photoUrl = this.normalizeUrl(input.photoUrl);

    // CPF é write-only: campo vazio = "não mexe" (não apaga o que já existe).
    // Só com valor: valida, hashea e checa unicidade contra os outros donos.
    if (input.cpf !== undefined && input.cpf.trim() !== '') {
      const cpfHash = hashCpf(normalizeCpf(input.cpf));
      const clash = await this.prisma.owner.findUnique({
        where: { cpfHash },
        select: { id: true },
      });
      if (clash && clash.id !== ownerId) {
        throw new ConflictException('Este CPF já está em uso por outra conta.');
      }
      data.cpfHash = cpfHash;
    }

    const owner = await this.prisma.owner.update({
      where: { id: ownerId },
      data,
      select: PanelService.OWNER_SELECT,
    });
    return this.presentOwner(owner);
  }

  /**
   * Define ou troca a senha do dono. Conta nascida por login social não tem
   * senha: aqui ela ganha uma (passa a poder entrar por email/senha também).
   * Se JÁ existe senha, exige a atual (evita troca silenciosa por sessão
   * sequestrada). Não desloga a sessão atual.
   */
  async setPassword(
    ownerId: string,
    input: { currentPassword?: string; newPassword?: string },
  ) {
    const newPassword = input.newPassword ?? '';
    if (newPassword.length < 8) {
      throw new BadRequestException('A senha precisa de ao menos 8 caracteres.');
    }

    const owner = await this.prisma.owner.findUniqueOrThrow({
      where: { id: ownerId },
      select: { passwordHash: true },
    });

    // Já tem senha? Então isto é uma TROCA: confira a senha atual.
    if (owner.passwordHash) {
      const ok = input.currentPassword
        ? await argon2.verify(owner.passwordHash, input.currentPassword)
        : false;
      if (!ok) throw new UnauthorizedException('Senha atual incorreta.');
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.owner.update({ where: { id: ownerId }, data: { passwordHash } });
    return { ok: true };
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
        professional: { select: { name: true, phone: true, email: true } },
        customer: { select: { name: true, phone: true } },
        items: { select: { id: true, name: true, priceCents: true }, orderBy: { createdAt: 'asc' } },
      },
    });

    return appts.map((a) => ({
      id: a.id,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      status: a.status,
      paid: a.manualPaidAt !== null,
      confirmedByCustomer: a.customerConfirmedAt !== null,
      service: a.service.name,
      totalCents: a.totalCents,
      items: a.items,
      professional: a.professional.name,
      // Pro botão manual "avisar no WhatsApp": telefone do profissional e se ele já
      // tem canal automático (e-mail). Não exponho o e-mail cru.
      professionalPhone: a.professional.phone,
      professionalHasEmail: a.professional.email !== null,
      customer: { name: a.customer.name, phone: a.customer.phone },
    }));
  }

  /**
   * Substitui os itens cobrados de um agendamento (serviço principal + extras)
   * e recalcula o totalCents — em transação. Só enquanto NÃO pago: depois de
   * pago o valor congela (não reescreve histórico financeiro). Escopo por negócio.
   */
  async setAppointmentItems(
    businessId: string,
    id: string,
    rawItems: Array<{ name?: string; priceCents?: number; sourceServiceId?: string | null }>,
  ) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, businessId },
      select: { id: true, manualPaidAt: true },
    });
    if (!appt) throw new NotFoundException('Agendamento não encontrado.');
    if (appt.manualPaidAt) {
      throw new BadRequestException('Agendamento já pago: os itens não podem mais ser editados.');
    }

    // Sanitiza: nome obrigatório, preço inteiro >= 0 em centavos.
    const items = (rawItems ?? []).map((it) => {
      const name = (it.name ?? '').trim();
      if (!name) throw new BadRequestException('Todo item precisa de um nome.');
      if (name.length > 80) throw new BadRequestException('Nome de item muito longo (máx. 80).');
      const price = it.priceCents;
      if (price === undefined || !Number.isInteger(price) || price < 0) {
        throw new BadRequestException('Preço do item deve ser um inteiro em centavos (>= 0).');
      }
      return { name, priceCents: price, sourceServiceId: it.sourceServiceId ?? null };
    });
    if (items.length === 0) {
      throw new BadRequestException('O agendamento precisa de ao menos um item.');
    }

    const total = items.reduce((s, it) => s + it.priceCents, 0);

    return this.prisma.$transaction(async (tx) => {
      await tx.appointmentItem.deleteMany({ where: { appointmentId: id } });
      await tx.appointmentItem.createMany({
        data: items.map((it) => ({ appointmentId: id, ...it })),
      });
      return tx.appointment.update({
        where: { id },
        data: { totalCents: total },
        select: { id: true, totalCents: true },
      });
    });
  }

  /** Cancela um agendamento do negócio. Reusa o BookingService (já scopa). */
  cancel(businessId: string, appointmentId: string) {
    return this.booking.cancelAppointment(businessId, appointmentId);
  }

  /**
   * Lista os clientes do negócio já com os números de CRM: total gasto (pagos),
   * nº de visitas (COMPLETED), última visita e segmento. Agrega tudo em memória
   * a partir de uma única varredura dos agendamentos do negócio.
   */
  async listCustomers(businessId: string) {
    const [business, customers, appts] = await Promise.all([
      this.prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { inactiveDays: true, vipMinSpentCents: true, recurringMinVisits: true },
      }),
      this.prisma.customer.findMany({
        where: { businessId },
        select: { id: true, name: true, phone: true, email: true, ownerNote: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.appointment.findMany({
        where: { businessId, status: { not: 'CANCELLED' } },
        select: { customerId: true, status: true, totalCents: true, manualPaidAt: true, startAt: true },
      }),
    ]);

    const stats = this.aggregateCustomerStats(appts);
    const now = new Date();

    return customers.map((c) => {
      const s = stats.get(c.id) ?? EMPTY_STATS;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        ownerNote: c.ownerNote,
        totalAppointments: s.total,
        visits: s.visits,
        totalSpentCents: s.spentCents,
        lastAt: s.lastVisitAt?.toISOString() ?? null,
        segment: this.segmentOf(business, s, now),
      };
    });
  }

  /** Soma por cliente: total de agendamentos, visitas (COMPLETED), gasto (pago), 1ª/última visita. */
  private aggregateCustomerStats(
    appts: Array<{ customerId: string; status: AppointmentStatus; totalCents: number; manualPaidAt: Date | null; startAt: Date }>,
  ) {
    const map = new Map<string, CustomerStats>();
    for (const a of appts) {
      const s = map.get(a.customerId) ?? { total: 0, visits: 0, paidCount: 0, spentCents: 0, firstVisitAt: null, lastVisitAt: null };
      s.total += 1;
      if (a.manualPaidAt) {
        s.paidCount += 1;
        s.spentCents += a.totalCents;
      }
      if (a.status === 'COMPLETED') {
        s.visits += 1;
        if (!s.firstVisitAt || a.startAt < s.firstVisitAt) s.firstVisitAt = a.startAt;
        if (!s.lastVisitAt || a.startAt > s.lastVisitAt) s.lastVisitAt = a.startAt;
      }
      map.set(a.customerId, s);
    }
    return map;
  }

  /**
   * Segmento do cliente (precedência): sem visitas -> Novo; última visita além de
   * inactiveDays -> Sumido; gasto >= vipMinSpentCents -> VIP; visitas >=
   * recurringMinVisits -> Recorrente; senão Novo.
   */
  private segmentOf(
    business: { inactiveDays: number; vipMinSpentCents: number | null; recurringMinVisits: number },
    s: CustomerStats,
    now: Date,
  ): { kind: 'NOVO' | 'SUMIDO' | 'VIP' | 'RECORRENTE'; inactiveDays?: number } {
    if (s.visits === 0) return { kind: 'NOVO' };
    if (s.lastVisitAt) {
      const days = Math.floor((now.getTime() - s.lastVisitAt.getTime()) / 86_400_000);
      if (days > business.inactiveDays) return { kind: 'SUMIDO', inactiveDays: days };
    }
    if (business.vipMinSpentCents != null && s.spentCents >= business.vipMinSpentCents) {
      return { kind: 'VIP' };
    }
    if (s.visits >= business.recurringMinVisits) return { kind: 'RECORRENTE' };
    return { kind: 'NOVO' };
  }

  /**
   * Ficha completa de um cliente (CRM). Agregados financeiros + segmento +
   * serviços mais feitos + histórico + mensagem de retorno pronta pro WhatsApp.
   * Escopado por businessId (o cliente tem de ser do negócio do dono).
   */
  async getCustomerDetail(businessId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId },
      select: { id: true, name: true, phone: true, email: true, ownerNote: true, createdAt: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado.');

    const [business, appts] = await Promise.all([
      this.prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { name: true, inactiveDays: true, vipMinSpentCents: true, recurringMinVisits: true },
      }),
      this.prisma.appointment.findMany({
        where: { businessId, customerId, status: { not: 'CANCELLED' } },
        orderBy: { startAt: 'desc' },
        select: {
          id: true,
          startAt: true,
          status: true,
          totalCents: true,
          manualPaidAt: true,
          service: { select: { name: true, followUpMessage: true } },
          professional: { select: { name: true } },
          items: { select: { name: true, priceCents: true }, orderBy: { createdAt: 'asc' } },
        },
      }),
    ]);

    const now = new Date();
    const s = this.aggregateCustomerStats(
      appts.map((a) => ({ customerId, status: a.status, totalCents: a.totalCents, manualPaidAt: a.manualPaidAt, startAt: a.startAt })),
    ).get(customerId) ?? EMPTY_STATS;

    // Serviços mais feitos: conta os itens dos atendimentos CONCLUÍDOS.
    const svc = new Map<string, number>();
    for (const a of appts) {
      if (a.status !== 'COMPLETED') continue;
      for (const it of a.items) svc.set(it.name, (svc.get(it.name) ?? 0) + 1);
    }
    const topServices = [...svc.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, 5);

    // Mensagem de retorno pronta (mesmo render do follow-up). Usa o serviço do
    // atendimento mais recente como {servico}; cai no template padrão se não houver.
    const lastService = appts[0]?.service;
    const whatsappMessage = renderFollowUpMessage(
      lastService?.followUpMessage ?? null,
      customer.name,
      lastService?.name ?? 'seu atendimento',
      business.name,
    );

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      ownerNote: customer.ownerNote,
      createdAt: customer.createdAt.toISOString(),
      totalSpentCents: s.spentCents,
      paidCount: s.paidCount,
      visits: s.visits,
      avgTicketCents: s.paidCount > 0 ? Math.round(s.spentCents / s.paidCount) : 0,
      firstVisitAt: s.firstVisitAt?.toISOString() ?? null,
      lastVisitAt: s.lastVisitAt?.toISOString() ?? null,
      segment: this.segmentOf(business, s, now),
      topServices,
      whatsappMessage,
      history: appts.map((a) => ({
        id: a.id,
        startAt: a.startAt.toISOString(),
        status: a.status,
        paid: a.manualPaidAt !== null,
        totalCents: a.totalCents,
        service: a.service.name,
        professional: a.professional.name,
        items: a.items,
      })),
    };
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

  /**
   * Marca a presença: concluído, falta ou desfaz (volta a CONFIRMED). É a
   * presença — não confunda com o pagamento (setAppointmentPaid).
   */
  async setAppointmentStatus(
    businessId: string,
    id: string,
    status: 'COMPLETED' | 'NO_SHOW' | 'CONFIRMED',
  ) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!appt) throw new NotFoundException('Agendamento não encontrado.');
    return this.prisma.appointment.update({ where: { id }, data: { status } });
  }

  /**
   * Marca/desmarca o pagamento manual do dono. Estado SEPARADO da presença e do
   * sinal/Stripe (paymentStatus/paidAt) — só mexe em manualPaidAt.
   */
  async setAppointmentPaid(businessId: string, id: string, paid: boolean) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!appt) throw new NotFoundException('Agendamento não encontrado.');
    return this.prisma.appointment.update({
      where: { id },
      data: { manualPaidAt: paid ? new Date() : null },
    });
  }

  /**
   * Relatório de faturamento num período [from, to), em TRÊS baldes usando o
   * total EDITADO (Appointment.totalCents):
   *   - Recebido: pago (manualPaidAt != null)
   *   - A receber: não pago já atendido (COMPLETED ou no passado), exceto NO_SHOW
   *   - Previsto: não pago, futuro e CONFIRMED
   * NO_SHOW não pago e PENDING (aguardando sinal) não entram em balde nenhum.
   * Breakdowns por serviço/profissional somam o totalCents dos não-cancelados.
   */
  async getRevenueReport(businessId: string, from: Date, to: Date) {
    const appts = await this.prisma.appointment.findMany({
      where: {
        businessId,
        status: { not: 'CANCELLED' },
        startAt: { gte: from, lt: to },
      },
      select: {
        startAt: true,
        status: true,
        totalCents: true,
        manualPaidAt: true,
        service: { select: { name: true } },
        professional: { select: { name: true } },
      },
    });

    const now = new Date();
    const bucket = { previsto: { cents: 0, count: 0 }, aReceber: { cents: 0, count: 0 }, recebido: { cents: 0, count: 0 } };
    const byService = new Map<string, { count: number; cents: number }>();
    const byProfessional = new Map<string, { count: number; cents: number }>();
    const bump = (m: Map<string, { count: number; cents: number }>, key: string, cents: number) => {
      const cur = m.get(key) ?? { count: 0, cents: 0 };
      cur.count += 1;
      cur.cents += cents;
      m.set(key, cur);
    };

    for (const a of appts) {
      const cents = a.totalCents;
      if (a.manualPaidAt) {
        bucket.recebido.cents += cents;
        bucket.recebido.count += 1;
      } else if (a.status === 'NO_SHOW') {
        // faltou e não pagou: não há dinheiro a esperar — fora dos baldes.
      } else if (a.status === 'COMPLETED' || a.startAt < now) {
        bucket.aReceber.cents += cents;
        bucket.aReceber.count += 1;
      } else if (a.status === 'CONFIRMED') {
        bucket.previsto.cents += cents;
        bucket.previsto.count += 1;
      }
      // PENDING futuro (aguardando sinal) cai aqui e fica fora dos baldes.

      // Breakdowns: tudo que não é cancelado, exceto faltas (sem valor real).
      if (a.status !== 'NO_SHOW') {
        bump(byService, a.service.name, cents);
        bump(byProfessional, a.professional.name, cents);
      }
    }

    const toList = (m: Map<string, { count: number; cents: number }>) =>
      [...m.entries()]
        .map(([name, v]) => ({ name, count: v.count, cents: v.cents }))
        .sort((a, b) => b.cents - a.cents);

    return {
      previstoCents: bucket.previsto.cents,
      previstoCount: bucket.previsto.count,
      aReceberCents: bucket.aReceber.cents,
      aReceberCount: bucket.aReceber.count,
      recebidoCents: bucket.recebido.cents,
      recebidoCount: bucket.recebido.count,
      byService: toList(byService),
      byProfessional: toList(byProfessional),
    };
  }

  /**
   * Relatório de FATURAMENTO por profissional num período [from, to).
   * Conta só atendimentos REALIZADOS: status COMPLETED OU pago à mão
   * (manualPaidAt != null); NO_SHOW nunca entra.
   * Faturamento = Appointment.totalCents (valor final/editado do atendimento).
   * Também apura tempo trabalhado (soma das durações) e dias distintos no fuso
   * do negócio. Filtrável por professionalId (opcional). Escopado por businessId.
   */
  async getProfessionalRevenueReport(
    businessId: string,
    from: Date,
    to: Date,
    professionalId?: string,
  ) {
    // Fuso do negócio pra apurar "dias trabalhados" na data local, não em UTC.
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    const tz = business?.timezone ?? 'America/Sao_Paulo';

    const appts = await this.prisma.appointment.findMany({
      where: {
        businessId,
        ...(professionalId ? { professionalId } : {}),
        startAt: { gte: from, lt: to },
        // Realizado = concluído ou pago; falta (NO_SHOW) não fatura.
        OR: [{ status: 'COMPLETED' }, { manualPaidAt: { not: null } }],
        NOT: { status: 'NO_SHOW' },
      },
      select: {
        startAt: true,
        endAt: true,
        totalCents: true,
        professional: {
          select: { id: true, name: true },
        },
      },
    });

    type Acc = {
      name: string;
      count: number;
      generatedCents: number;
      workedMinutes: number;
      days: Set<string>; // datas locais distintas (YYYY-MM-DD no fuso do negócio)
    };
    const byPro = new Map<string, Acc>();
    const allDays = new Set<string>(); // dias trabalhados do negócio (p/ o total)

    for (const a of appts) {
      const pro = a.professional;
      const cur =
        byPro.get(pro.id) ?? {
          name: pro.name,
          count: 0,
          generatedCents: 0,
          workedMinutes: 0,
          days: new Set<string>(),
        };
      const minutes = Math.max(0, Math.round((a.endAt.getTime() - a.startAt.getTime()) / 60_000));
      const dayKey = DateTime.fromJSDate(a.startAt, { zone: tz }).toISODate() ?? '';
      cur.count += 1;
      cur.generatedCents += a.totalCents;
      cur.workedMinutes += minutes;
      cur.days.add(dayKey);
      byPro.set(pro.id, cur);
      allDays.add(dayKey);
    }

    const professionals = [...byPro.entries()]
      .map(([id, v]) => ({
        professionalId: id,
        name: v.name,
        count: v.count,
        generatedCents: v.generatedCents,
        workedMinutes: v.workedMinutes,
        daysWorked: v.days.size,
      }))
      .sort((a, b) => b.generatedCents - a.generatedCents);

    return {
      professionals,
      totalCount: professionals.reduce((s, p) => s + p.count, 0),
      totalGeneratedCents: professionals.reduce((s, p) => s + p.generatedCents, 0),
      totalWorkedMinutes: professionals.reduce((s, p) => s + p.workedMinutes, 0),
      totalDaysWorked: allDays.size,
    };
  }

  // Default: agendamentos não-cancelados (inclui COMPLETED/NO_SHOW pra que a
  // marcação de presença continue visível na agenda). Se vier status, valida.
  private parseStatus(status?: string): Prisma.EnumAppointmentStatusFilter {
    if (!status) {
      return {
        in: [
          AppointmentStatus.PENDING,
          AppointmentStatus.CONFIRMED,
          AppointmentStatus.COMPLETED,
          AppointmentStatus.NO_SHOW,
        ],
      };
    }
    if (!(status in AppointmentStatus)) {
      throw new BadRequestException(`status inválido: ${status}`);
    }
    return { equals: status as AppointmentStatus };
  }
}
