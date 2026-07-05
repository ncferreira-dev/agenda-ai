import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';
import { OAuthProvider } from '@prisma/client';
import type { OAuthProfile } from '../auth.service';
import { requiredInProd } from '../../common/env';

// Base pública DESTE backend (onde o Google devolve o callback). Reusa a mesma
// var que já monta as URLs de upload. Se o Google estiver ligado em produção,
// PUBLIC_API_URL é obrigatória (senão o callback iria pra localhost e quebraria);
// com o OAuth desligado, o fallback basta — a estratégia nem é usada.
export function oauthCallbackBase(): string {
  return isGoogleConfigured()
    ? requiredInProd('PUBLIC_API_URL', 'http://localhost:3000')
    : process.env.PUBLIC_API_URL ?? 'http://localhost:3000';
}

// Só está de fato ligado se as credenciais existirem. O controller usa isso
// pra não mandar ninguém pro Google com placeholder (e o boot não quebra sem
// as vars — login/senha segue funcionando).
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      // Fallback não-vazio só pra estratégia construir quando o Google ainda
      // não foi configurado; o controller barra o fluxo antes de usar isto.
      clientID: process.env.GOOGLE_CLIENT_ID || 'google-nao-configurado',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'google-nao-configurado',
      callbackURL: `${oauthCallbackBase()}/auth/oauth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  // Normaliza o perfil do Google no contrato OAuthProfile. Vira req.user.
  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value ?? null;
    // O Google marca email_verified no _json; só vinculamos contas com ele true.
    const emailVerified = Boolean(
      (profile._json as { email_verified?: boolean })?.email_verified,
    );
    const result: OAuthProfile = {
      provider: OAuthProvider.GOOGLE,
      providerAccountId: profile.id,
      email,
      emailVerified,
      name: profile.displayName ?? null,
    };
    done(null, result);
  }
}
