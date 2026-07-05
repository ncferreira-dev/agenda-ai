import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuthProvider, Prisma, ServiceMode } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RESERVED_SLUGS, SLUG_MAX, SLUG_MIN, slugify } from '../common/slug';
import { newReferralCode, normalizeReferralCode } from '../common/referral-code';

// Duração do teste grátis do dono (só o status; o bloqueio é da Fase 5).
const TRIAL_DAYS = 14;

// Validade do code de troca pós-OAuth. Curto de propósito: só existe entre o
// callback do provedor e o front trocar pelo JWT.
const EXCHANGE_TTL_MS = 60 * 1000;

// Perfil normalizado que vem da estratégia social (ex.: GoogleStrategy).
export interface OAuthProfile {
  provider: OAuthProvider;
  providerAccountId: string; // "sub" estável do provedor
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

// Payload do JWT. É o que viaja no token e escopa a sessão do painel:
// businessId é a chave do multi-tenant (regra de ouro 1).
export interface JwtPayload {
  sub: string; // ownerId
  businessId: string;
  email: string;
}

// Formato injetado em req.user pela JwtStrategy.
export interface AuthenticatedOwner {
  ownerId: string;
  businessId: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  /** Hash de senha pra gravar. Usado pelo seed/registro. */
  hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain);
  }

  private verifyPassword(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  /**
   * Valida email + senha e devolve o dono. Lança 401 genérico em qualquer
   * falha (email inexistente OU senha errada) pra não vazar qual dos dois falhou.
   */
  async validateOwner(email: string, password: string) {
    const owner = await this.prisma.owner.findUnique({ where: { email } });
    if (!owner) throw new UnauthorizedException('Credenciais inválidas.');

    // Conta criada só por login social não tem senha. Não vaza isso como
    // "email existe": mensagem genérica e orienta o caminho certo.
    if (!owner.passwordHash) {
      throw new UnauthorizedException(
        'Essa conta usa login social. Entre com o Google.',
      );
    }

    const ok = await this.verifyPassword(owner.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas.');

    return owner;
  }

  /** Faz login: valida e emite o token com o businessId embutido. */
  async login(email: string, password: string) {
    const owner = await this.validateOwner(email, password);

    const payload: JwtPayload = {
      sub: owner.id,
      businessId: owner.businessId,
      email: owner.email,
    };

    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: owner.businessId },
      select: { id: true, name: true, slug: true },
    });

    return {
      access_token: await this.jwt.signAsync(payload),
      owner: { id: owner.id, name: owner.name, email: owner.email },
      business,
    };
  }

  /**
   * Cadastro público do dono: cria Business + Owner e já devolve a sessão
   * (mesmo shape do login). Negócio nasce em trial de 14 dias. NÃO mexe em
   * login/guard/escopo. Pede o MÍNIMO (nome, email, senha, nome do negócio) +
   * o tipo de atendimento; o CPF só é pedido depois, na hora de assinar um plano.
   */
  async register(input: {
    name: string;
    email: string;
    password: string;
    businessName: string;
    serviceMode?: string;
    address?: string;
    meetingUrl?: string;
    referralCode?: string; // código de indicação vindo do link (?ref=)
  }) {
    const name = (input.name ?? '').trim();
    const email = (input.email ?? '').trim().toLowerCase();
    const businessName = (input.businessName ?? '').trim();
    const password = input.password ?? '';

    if (!name) throw new BadRequestException('Informe seu nome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('Email inválido.');
    }
    if (password.length < 8) {
      throw new BadRequestException('A senha precisa de ao menos 8 caracteres.');
    }
    if (!businessName) throw new BadRequestException('Informe o nome do negócio.');

    const serviceMode = this.normalizeServiceMode(input.serviceMode);
    // Ripple do tipo de atendimento: remoto não guarda endereço; presencial não
    // guarda link de atendimento; híbrido pode guardar os dois.
    const address =
      serviceMode === ServiceMode.REMOTO ? null : (input.address ?? '').trim() || null;
    const meetingUrl =
      serviceMode === ServiceMode.PRESENCIAL ? null : this.normalizeMeetingUrl(input.meetingUrl);

    // Checagem amigável (mensagem específica). O @unique de email é o backstop
    // real contra corrida — tratado no catch de P2002 abaixo.
    const emailClash = await this.prisma.owner.findUnique({
      where: { email },
      select: { id: true },
    });
    if (emailClash) {
      throw new ConflictException('Esse email já tem conta. Faça login.');
    }

    const slug = await this.generateUniqueSlug(businessName);
    const passwordHash = await this.hashPassword(password);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const referredByCode = normalizeReferralCode(input.referralCode);

    let owner: { id: string; businessId: string; name: string; email: string };
    try {
      owner = await this.prisma.$transaction(async (tx) => {
        // Resolve a indicação DENTRO da transação. Código inválido/inexistente é
        // ignorado em silêncio (não trava o cadastro por um link errado).
        const referrer = referredByCode
          ? await tx.business.findUnique({
              where: { referralCode: referredByCode },
              select: { id: true },
            })
          : null;

        const business = await tx.business.create({
          data: {
            name: businessName,
            slug,
            subscriptionStatus: 'TRIALING',
            trialEndsAt,
            serviceMode,
            address,
            meetingUrl,
            referralCode: await this.generateUniqueReferralCode(tx),
            referredByCode: referrer ? referredByCode : null,
          },
        });

        // Grava a atribuição (PENDING). O desconto/recompensa só são realizados
        // quando este negócio ASSINAR (BillingService.confirmSubscription).
        if (referrer && referrer.id !== business.id) {
          await tx.referral.create({
            data: {
              referrerBusinessId: referrer.id,
              referredBusinessId: business.id,
              code: referredByCode as string,
            },
          });
        }

        return tx.owner.create({
          data: { businessId: business.id, name, email, passwordHash },
          select: { id: true, businessId: true, name: true, email: true },
        });
      });
    } catch (e) {
      // Corrida: email/slug colidiu entre a checagem e o insert.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Não foi possível criar a conta. Tente de novo.');
      }
      throw e;
    }

    return this.buildSession(owner);
  }

  // --- Login social (Google) ---------------------------------------------

  /**
   * Resolve um perfil social num Owner, seguindo três caminhos (nesta ordem):
   *  1. Já existe OAuthAccount pra esse provider+id → é login: usa aquele Owner.
   *  2. O email do provedor já é de um Owner → VINCULA (cria OAuthAccount
   *     apontando pro Owner existente) em vez de duplicar. Só vincula se o
   *     email vier verificado, senão seria sequestro de conta.
   *  3. Email novo → CRIA Business + Owner (sem senha), reusando o trial de 14d.
   * Devolve o ownerId. NÃO emite JWT aqui (quem faz isso é o fluxo de troca).
   */
  async findOrLinkOrCreateFromOAuth(profile: OAuthProfile): Promise<string> {
    const email = (profile.email ?? '').trim().toLowerCase();

    // 1. Já vinculado: login direto.
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      select: { ownerId: true },
    });
    if (existing) return existing.ownerId;

    // 2. Vincular a um Owner que já tem esse email (só com email verificado).
    if (email && profile.emailVerified) {
      const owner = await this.prisma.owner.findUnique({
        where: { email },
        select: { id: true },
      });
      if (owner) {
        await this.prisma.oAuthAccount.create({
          data: {
            ownerId: owner.id,
            provider: profile.provider,
            providerAccountId: profile.providerAccountId,
            email: email || null,
          },
        });
        return owner.id;
      }
    }

    if (!email) {
      throw new BadRequestException(
        'Sua conta social não retornou um email. Cadastre-se por email e senha.',
      );
    }

    // 3. Conta nova: cria Business + Owner (sem senha) e o OAuthAccount juntos.
    // businessName derivado do nome do perfil; onboardedAt fica null, então o
    // wizard de onboarding existente captura a pessoa pra configurar o negócio.
    const businessName = this.deriveBusinessName(profile.name);
    const slug = await this.generateUniqueSlug(businessName);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const ownerName = (profile.name ?? '').trim() || email.split('@')[0];

    try {
      const owner = await this.prisma.$transaction(async (tx) => {
        const business = await tx.business.create({
          data: {
            name: businessName,
            slug,
            subscriptionStatus: 'TRIALING',
            trialEndsAt,
            referralCode: await this.generateUniqueReferralCode(tx),
          },
        });
        return tx.owner.create({
          data: {
            businessId: business.id,
            name: ownerName,
            email,
            // sem passwordHash: login social não define senha
            oauthAccounts: {
              create: {
                provider: profile.provider,
                providerAccountId: profile.providerAccountId,
                email,
              },
            },
          },
          select: { id: true },
        });
      });
      return owner.id;
    } catch (e) {
      // Corrida: email/slug colidiu entre a checagem e o insert.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Só cai no vínculo se o email for verificado — senão um email não
        // verificado que colide com um Owner existente viraria sequestro de
        // conta pela porta dos fundos (mesma invariante do passo 2 acima).
        if (profile.emailVerified) {
          const owner = await this.prisma.owner.findUnique({
            where: { email },
            select: { id: true },
          });
          if (owner) {
            await this.prisma.oAuthAccount.create({
              data: {
                ownerId: owner.id,
                provider: profile.provider,
                providerAccountId: profile.providerAccountId,
                email,
              },
            });
            return owner.id;
          }
        }
        throw new ConflictException(
          'Esse email já tem conta. Faça login por email e senha.',
        );
      }
      throw e;
    }
  }

  // Nome de negócio de partida pra quem entra por social. O dono renomeia no
  // onboarding; aqui é só um rótulo amigável pra não nascer vazio.
  private deriveBusinessName(name?: string | null): string {
    const first = (name ?? '').trim().split(/\s+/)[0];
    return first ? `Negócio de ${first}` : 'Meu negócio';
  }

  /**
   * Emite um code de uso único (guarda só o hash) pra sessão do dono. O front
   * troca esse code pelo JWT via consumeExchangeCode. Assim o token não anda na URL.
   */
  async createExchangeCode(ownerId: string): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    const codeHash = createHash('sha256').update(code).digest('hex');
    await this.prisma.authExchange.create({
      data: {
        ownerId,
        codeHash,
        expiresAt: new Date(Date.now() + EXCHANGE_TTL_MS),
      },
    });
    return code;
  }

  /** Troca o code pelo JWT+sessão (mesmo shape do login). Uso único e expira. */
  async consumeExchangeCode(code: string) {
    const codeHash = createHash('sha256').update(code ?? '').digest('hex');
    const row = await this.prisma.authExchange.findUnique({ where: { codeHash } });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException('Sessão social inválida ou expirada.');
    }
    // Marca como usado já (uso único). Se já foi usado, updateMany não casa.
    const claimed = await this.prisma.authExchange.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new UnauthorizedException('Sessão social inválida ou expirada.');
    }

    const owner = await this.prisma.owner.findUniqueOrThrow({
      where: { id: row.ownerId },
      select: { id: true, businessId: true, name: true, email: true },
    });
    return this.buildSession(owner);
  }

  // Tipo de atendimento; qualquer valor fora do enum cai em PRESENCIAL.
  private normalizeServiceMode(value?: string): ServiceMode {
    if (value === ServiceMode.REMOTO || value === ServiceMode.HIBRIDO) return value;
    return ServiceMode.PRESENCIAL;
  }

  // Link de atendimento online; vazio vira null; sem esquema recebe https://.
  private normalizeMeetingUrl(value?: string): string | null {
    const v = (value ?? '').trim();
    if (!v) return null;
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  }

  /** Monta o retorno de sessão (token + owner + business), igual ao login. */
  private async buildSession(owner: {
    id: string;
    businessId: string;
    name: string;
    email: string;
  }) {
    const payload: JwtPayload = {
      sub: owner.id,
      businessId: owner.businessId,
      email: owner.email,
    };
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: owner.businessId },
      select: { id: true, name: true, slug: true },
    });
    return {
      access_token: await this.jwt.signAsync(payload),
      owner: { id: owner.id, name: owner.name, email: owner.email },
      business,
    };
  }

  /**
   * Gera um slug único a partir do nome do negócio: slugify + sufixo numérico
   * até achar um livre (respeitando reservados e o @unique do slug).
   */
  private async generateUniqueSlug(name: string): Promise<string> {
    let base = slugify(name).slice(0, SLUG_MAX).replace(/-+$/, '');
    if (base.length < SLUG_MIN) base = 'negocio';

    for (let n = 0; n < 1000; n++) {
      const suffix = n === 0 ? '' : `-${n + 1}`;
      const candidate =
        base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, '') + suffix;
      if (RESERVED_SLUGS.has(candidate)) continue;
      const clash = await this.prisma.business.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    // Praticamente inalcançável; fallback determinístico curto.
    return `${base}`.slice(0, SLUG_MAX - 7) + '-' + Math.floor(Date.now() % 1e6).toString(36);
  }

  /**
   * Gera um código de indicação único (respeitando o @unique de referralCode).
   * Recebe o client da transação pra checar unicidade no mesmo escopo do insert.
   */
  private async generateUniqueReferralCode(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    for (let n = 0; n < 20; n++) {
      const candidate = newReferralCode();
      const clash = await tx.business.findUnique({
        where: { referralCode: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    // Praticamente inalcançável (espaço ~729M); acrescenta entropia extra.
    return newReferralCode() + newReferralCode().slice(0, 2);
  }
}
