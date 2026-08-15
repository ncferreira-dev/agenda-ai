import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { isGoogleConfigured } from '../strategies/google.strategy';
import { webOrigin } from '../../common/env';

// Guarda do fluxo Google. Se o Google não estiver configurado, não tenta a
// estratégia (que usaria placeholder): manda de volta pro login com um aviso.
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isGoogleConfigured()) {
      const res = context.switchToHttp().getResponse<Response>();
      res.redirect(`${webOrigin()}/painel/login?erro=google-indisponivel`);
      return false;
    }
    return (await super.canActivate(context)) as boolean;
  }
}
