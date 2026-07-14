import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedOwner, JwtPayload } from '../auth.service';
import { requireJwtSecret } from '../jwt-secret';
import { PrismaService } from '../../prisma/prisma.service';

// Valida o Bearer token e devolve o objeto que o Nest injeta em req.user.
// A partir daqui, businessId NUNCA vem do cliente — só do token.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireJwtSecret(),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedOwner> {
    // Invalida tokens emitidos antes da última troca de senha (reset de senha).
    const owner = await this.prisma.owner.findUnique({
      where: { id: payload.sub },
      select: { passwordChangedAt: true },
    });
    if (!owner) throw new UnauthorizedException();
    if (owner.passwordChangedAt && payload.iat) {
      const issuedAt = new Date(payload.iat * 1000);
      if (issuedAt < owner.passwordChangedAt) {
        throw new UnauthorizedException('Sessão expirada. Entre de novo.');
      }
    }

    return {
      ownerId: payload.sub,
      businessId: payload.businessId,
      email: payload.email,
    };
  }
}
