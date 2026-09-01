import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, ServiceMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VERTICAL_PRESETS, getVertical, isSkinId, SKINS } from '../../presets/verticais';
import { normalizeColor, requireRange, normalizeEmail, normalizeUrl, normalizePhone } from '../panel.utils';
import { RESERVED_SLUGS, SLUG_MAX, SLUG_MIN, SLUG_RE } from '../../common/slug';

// Dados, branding e onboarding do negócio.
// Todo método recebe businessId como 1º argumento e filtra por ele — o
// businessId vem do JWT, nunca do corpo da requisição.
//
// Nasceu do PanelService, que tinha 1028 linhas e cinco assuntos dentro.
@Injectable()
export class BusinessService {
  constructor(
    private prisma: PrismaService,
  ) {}

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

  /** Dados do negócio do dono logado (inclui branding). */
  getBusiness(businessId: string) {
    return this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: BusinessService.BUSINESS_SELECT,
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
      data.inactiveDays = requireRange(input.inactiveDays, 7, 730, 'dias para "sumido"');
    }
    if (input.recurringMinVisits !== undefined) {
      data.recurringMinVisits = requireRange(input.recurringMinVisits, 2, 100, 'visitas para "recorrente"');
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
      data.reminderHoursBefore = requireRange(input.reminderHoursBefore, 1, 168, 'lembrete (horas)');
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
      if (!BusinessService.TIMEZONES.includes(input.timezone)) {
        throw new BadRequestException('Fuso horário inválido.');
      }
      data.timezone = input.timezone;
    }
    if (input.slotStepMinutes !== undefined) {
      data.slotStepMinutes = requireRange(input.slotStepMinutes, 5, 120, 'passo dos horários');
    }
    if (input.minLeadMinutes !== undefined) {
      data.minLeadMinutes = requireRange(input.minLeadMinutes, 0, 10080, 'antecedência mínima');
    }
    if (input.maxAdvanceDays !== undefined) {
      data.maxAdvanceDays = requireRange(input.maxAdvanceDays, 1, 365, 'janela de agendamento');
    }

    if (input.notifyWhatsApp !== undefined) data.notifyWhatsApp = Boolean(input.notifyWhatsApp);
    if (input.notifyEmail !== undefined) data.notifyEmail = Boolean(input.notifyEmail);
    if (input.notifyPush !== undefined) data.notifyPush = Boolean(input.notifyPush);
    if (input.notifyOwnerAllBookings !== undefined) data.notifyOwnerAllBookings = Boolean(input.notifyOwnerAllBookings);
    if (input.notifyDailySummary !== undefined) data.notifyDailySummary = Boolean(input.notifyDailySummary);
    if (input.ownerWhatsApp !== undefined) data.ownerWhatsApp = normalizePhone(input.ownerWhatsApp);
    if (input.ownerEmail !== undefined) data.ownerEmail = normalizeEmail(input.ownerEmail);

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('O nome não pode ficar vazio.');
      data.name = name;
    }
    if (input.slug !== undefined) {
      data.slug = await this.normalizeSlug(input.slug, businessId);
    }
    if (input.accentColor !== undefined) {
      data.accentColor = normalizeColor(input.accentColor);
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
    if (input.instagramUrl !== undefined) data.instagramUrl = normalizeUrl(input.instagramUrl);
    if (input.logoUrl !== undefined) data.logoUrl = normalizeUrl(input.logoUrl);
    if (input.coverUrl !== undefined) data.coverUrl = normalizeUrl(input.coverUrl);

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
        select: BusinessService.BUSINESS_SELECT,
      });
    } catch (e) {
      // Backstop de corrida: o @unique do slug pegou uma colisão simultânea.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Esse link já está em uso. Escolha outro.');
      }
      throw e;
    }
  }

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

  // Slug da página pública. As regras (formato, tamanho, reservados) vêm de
  // common/slug.ts, a MESMA fonte que o cadastro usa pra gerar o slug inicial.
  // Existia uma segunda cópia da lista de reservados aqui dentro, e as duas já
  // tinham divergido: 'registro' era barrado no cadastro e liberado no painel.
  // Duas cópias da mesma regra não ficam iguais sozinhas.
  private async normalizeSlug(value: string, businessId: string): Promise<string> {
    const slug = value.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      throw new BadRequestException(
        'O link só pode ter letras minúsculas, números e hífen (sem espaços nem acentos).',
      );
    }
    if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) {
      throw new BadRequestException(`O link deve ter entre ${SLUG_MIN} e ${SLUG_MAX} caracteres.`);
    }
    if (RESERVED_SLUGS.has(slug)) {
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
}
