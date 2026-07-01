import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { hashCpf, isValidCpf } from '../common/cpf';
import { RESERVED_SLUGS, SLUG_MAX, SLUG_MIN, slugify } from '../common/slug';

// Duração do teste grátis do dono (só o status; o bloqueio é da Fase 5).
const TRIAL_DAYS = 14;

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
   * login/guard/escopo. CPF é validado e guardado só como hash (LGPD).
   */
  async register(input: {
    name: string;
    email: string;
    password: string;
    businessName: string;
    cpf: string;
  }) {
    const name = (input.name ?? '').trim();
    const email = (input.email ?? '').trim().toLowerCase();
    const businessName = (input.businessName ?? '').trim();
    const password = input.password ?? '';
    const cpfRaw = input.cpf ?? '';

    if (!name) throw new BadRequestException('Informe seu nome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('Email inválido.');
    }
    if (password.length < 8) {
      throw new BadRequestException('A senha precisa de ao menos 8 caracteres.');
    }
    if (!businessName) throw new BadRequestException('Informe o nome do negócio.');
    if (!isValidCpf(cpfRaw)) throw new BadRequestException('CPF inválido.');

    const cpfHash = hashCpf(cpfRaw);

    // Checagem amigável (mensagem específica). O @unique de email/cpfHash é o
    // backstop real contra corrida — tratado no catch de P2002 abaixo.
    const [emailClash, cpfClash] = await Promise.all([
      this.prisma.owner.findUnique({ where: { email }, select: { id: true } }),
      this.prisma.owner.findUnique({ where: { cpfHash }, select: { id: true } }),
    ]);
    if (emailClash) {
      throw new ConflictException('Esse email já tem conta. Faça login.');
    }
    if (cpfClash) {
      throw new ConflictException('Esse CPF já tem conta. Faça login ou recupere a senha.');
    }

    const slug = await this.generateUniqueSlug(businessName);
    const passwordHash = await this.hashPassword(password);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    let owner: { id: string; businessId: string; name: string; email: string };
    try {
      owner = await this.prisma.$transaction(async (tx) => {
        const business = await tx.business.create({
          data: {
            name: businessName,
            slug,
            subscriptionStatus: 'TRIALING',
            trialEndsAt,
          },
        });
        return tx.owner.create({
          data: { businessId: business.id, name, email, passwordHash, cpfHash },
          select: { id: true, businessId: true, name: true, email: true },
        });
      });
    } catch (e) {
      // Corrida: email/cpf/slug colidiu entre a checagem e o insert.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Não foi possível criar a conta. Tente de novo.');
      }
      throw e;
    }

    return this.buildSession(owner);
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
}
