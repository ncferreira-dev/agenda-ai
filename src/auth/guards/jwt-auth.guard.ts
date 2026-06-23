import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Protege rotas do painel. Sem Bearer token válido -> 401.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
