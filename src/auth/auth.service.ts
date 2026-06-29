import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { hashCpf, normalizeCpf } from '../common/cpf';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

// Janela de validade do link de redefinição de senha.
const RESET_TTL_MINUTES = 30;
// Intervalo mínimo entre dois envios de link pro mesmo email (anti-flood da
// caixa de entrada, independente do IP).
const RESET_COOLDOWN_MINUTES = 2;

// Dados do cadastro ("Criar conta"): cria negócio + dono numa transação só.
export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  businessName: string;
  cpf: string;
}

// Payload do JWT. É o que viaja no token e escopa a sessão do painel:
// businessId é a chave do multi-tenant (regra de ouro 1).
export interface JwtPayload {
  sub: string; // ownerId
  businessId: string;
  email: string;
  iat?: number; // emitido em (segundos); preenchido pelo JWT, usado p/ invalidar
}

// Formato injetado em req.user pela JwtStrategy.
export interface AuthenticatedOwner {
  ownerId: string;
  businessId: string;
  email: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mail: MailService,
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

    const ok = await this.verifyPassword(owner.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas.');

    return owner;
  }

  /** Faz login: valida e emite o token com o businessId embutido. */
  async login(email: string, password: string) {
    const owner = await this.validateOwner(email, password);
    return this.issueSession(owner);
  }

  /**
   * Cadastro do dono ("Criar conta"): cria o negócio e o dono numa transação.
   * Regras:
   *  - CPF é validado pelos dígitos verificadores (rejeita inválido).
   *  - CPF é único entre donos; guardamos só o blind index (LGPD), nunca o cru.
   *  - Email é único entre donos.
   * Em caso de duplicidade a mensagem orienta login/recuperação de senha.
   * Dá certo => já devolve a sessão (auto-login), igual ao login.
   */
  async register(input: RegisterInput) {
    const name = (input.name ?? '').trim();
    const email = (input.email ?? '').trim().toLowerCase();
    const businessName = (input.businessName ?? '').trim();
    const password = input.password ?? '';

    if (!name) throw new BadRequestException('Informe seu nome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('Email inválido.');
    }
    if (password.length < 8) {
      throw new BadRequestException('A senha deve ter ao menos 8 caracteres.');
    }
    if (!businessName) throw new BadRequestException('Informe o nome do negócio.');

    // Valida o CPF antes de qualquer escrita; lança 'CPF inválido.' se não for.
    const cpf = normalizeCpf(input.cpf ?? '');
    const cpfHash = hashCpf(cpf);

    // Pré-checagem amigável (a fonte da verdade é o @unique no banco, abaixo).
    const [emailTaken, cpfTaken] = await Promise.all([
      this.prisma.owner.findUnique({ where: { email }, select: { id: true } }),
      this.prisma.owner.findUnique({ where: { cpfHash }, select: { id: true } }),
    ]);
    if (cpfTaken) throw this.duplicateCpf();
    if (emailTaken) throw this.duplicateEmail();

    const passwordHash = await this.hashPassword(password);
    const slug = await this.generateUniqueSlug(businessName);

    let owner: { id: string; businessId: string; email: string; name: string };
    try {
      owner = await this.prisma.$transaction(async (tx) => {
        const business = await tx.business.create({
          data: { name: businessName, slug },
        });
        return tx.owner.create({
          data: { businessId: business.id, name, email, passwordHash, cpfHash },
        });
      });
    } catch (e) {
      // Backstop pra corrida entre dois cadastros simultâneos: a constraint
      // @unique do banco é quem garante; aqui só traduzimos pra mensagem clara.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = (e.meta?.target as string[] | string | undefined) ?? '';
        const field = Array.isArray(target) ? target.join(',') : String(target);
        if (field.includes('cpfHash')) throw this.duplicateCpf();
        if (field.includes('email')) throw this.duplicateEmail();
        if (field.includes('slug')) {
          throw new ConflictException(
            'Não foi possível gerar um endereço para o negócio. Tente de novo.',
          );
        }
      }
      throw e;
    }

    return this.issueSession(owner);
  }

  /**
   * Pede a redefinição de senha. Resposta SEMPRE genérica (não revela se o
   * email existe). Se existir, gera um token de uso único (guardamos só o hash)
   * e manda o link por e-mail. Sem SMTP em dev, o link vai pro log.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const normalized = (email ?? '').trim().toLowerCase();
    if (!normalized) return; // resposta genérica mesmo assim

    const owner = await this.prisma.owner.findUnique({
      where: { email: normalized },
      select: { id: true, name: true, business: { select: { name: true } } },
    });
    if (!owner) return; // não vaza que o email não existe

    // Cooldown por email: se já mandamos um link há pouco, não manda outro
    // (limita o volume na caixa do dono mesmo que o IP varie). Silencioso —
    // a resposta ao cliente continua genérica.
    const ultimo = await this.prisma.passwordReset.findFirst({
      where: { ownerId: owner.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (ultimo && ultimo.createdAt > new Date(Date.now() - RESET_COOLDOWN_MINUTES * 60_000)) {
      return;
    }

    // Invalida pedidos anteriores ainda válidos (só um link ativo por vez).
    await this.prisma.passwordReset.updateMany({
      where: { ownerId: owner.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);
    await this.prisma.passwordReset.create({
      data: { ownerId: owner.id, tokenHash: this.hashToken(token), expiresAt },
    });

    const base = process.env.WEB_ORIGIN ?? 'http://localhost:3001';
    const link = `${base}/painel/redefinir-senha?token=${token}`;

    if (this.mail.enabled) {
      await this.mail.sendPasswordReset(normalized, {
        businessName: owner.business.name,
        link,
        ttlMinutes: RESET_TTL_MINUTES,
      });
    } else {
      // Fallback de dev: sem SMTP, loga o link pra dar pra testar o fluxo.
      this.logger.warn(`[reset de senha] SMTP desligado — link p/ ${normalized}: ${link}`);
    }
  }

  /**
   * Redefine a senha a partir do token do link. Recusa token inexistente,
   * usado ou expirado. Em transação: troca a senha, marca o token como usado e
   * grava passwordChangedAt (invalida as sessões/JWTs antigos).
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if ((newPassword ?? '').length < 8) {
      throw new BadRequestException('A senha deve ter ao menos 8 caracteres.');
    }
    if (!token) throw new BadRequestException('Link inválido ou expirado.');

    const reset = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new BadRequestException('Link inválido ou expirado.');
    }

    const passwordHash = await this.hashPassword(newPassword);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.owner.update({
        where: { id: reset.ownerId },
        data: { passwordHash, passwordChangedAt: now },
      }),
      this.prisma.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: now },
      }),
    ]);
  }

  // SHA-256 do token. Sem segredo: o token já é aleatório forte (32 bytes),
  // então não há risco de força bruta — só não guardamos o cru.
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private duplicateCpf(): ConflictException {
    return new ConflictException(
      'Já existe uma conta com este CPF. Faça login ou recupere a senha.',
    );
  }

  private duplicateEmail(): ConflictException {
    return new ConflictException(
      'Já existe uma conta com este email. Faça login ou recupere a senha.',
    );
  }

  // Gera slug único pro negócio a partir do nome (a coluna é @unique).
  private slugify(name: string): string {
    const base = name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // tira acentos
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return base || 'negocio';
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = this.slugify(name);
    let candidate = base;
    let n = 1;
    while (
      await this.prisma.business.findUnique({
        where: { slug: candidate },
        select: { id: true },
      })
    ) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    return candidate;
  }

  /** Emite o token com businessId embutido e devolve dono + negócio. */
  private async issueSession(owner: {
    id: string;
    businessId: string;
    email: string;
    name: string;
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
}
