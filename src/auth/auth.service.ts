import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

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
}
