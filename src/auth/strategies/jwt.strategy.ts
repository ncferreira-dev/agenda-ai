import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedOwner, JwtPayload } from '../auth.service';
import { requireJwtSecret } from '../jwt-secret';

// Valida o Bearer token e devolve o objeto que o Nest injeta em req.user.
// A partir daqui, businessId NUNCA vem do cliente — só do token.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireJwtSecret(),
    });
  }

  validate(payload: JwtPayload): AuthenticatedOwner {
    return {
      ownerId: payload.sub,
      businessId: payload.businessId,
      email: payload.email,
    };
  }
}
