import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { isGoogleConfigured } from '../strategies/google.strategy';

// Base pública do front (pra onde voltar em caso de erro). Reusa WEB_ORIGIN.
function webBase(): string {
  return process.env.WEB_ORIGIN ?? 'http://localhost:3001';
}

// Guarda do fluxo Google. Se o Google não estiver configurado, não tenta a
// estratégia (que usaria placeholder): manda de volta pro login com um aviso.
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isGoogleConfigured()) {
      const res = context.switchToHttp().getResponse<Response>();
      res.redirect(`${webBase()}/painel/login?erro=google-indisponivel`);
      return false;
    }
    return (await super.canActivate(context)) as boolean;
  }
}
