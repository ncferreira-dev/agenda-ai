import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, type OAuthProfile } from './auth.service';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';

// Base pública do front (pra onde o backend devolve o navegador após o OAuth).
function webBase(): string {
  return process.env.WEB_ORIGIN ?? 'http://localhost:3001';
}

interface LoginBody {
  email: string;
  password: string;
}

interface RegisterBody {
  name: string;
  email: string;
  password: string;
  businessName: string;
  serviceMode?: string; // PRESENCIAL | REMOTO | HIBRIDO
  address?: string; // presencial/híbrido
  meetingUrl?: string; // remoto/híbrido
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginBody) {
    if (!body?.email || !body?.password) {
      throw new BadRequestException('Informe email e senha.');
    }
    return this.auth.login(body.email, body.password);
  }

  /** Cadastro público do dono: cria o negócio e já devolve a sessão. */
  @Post('register')
  async register(@Body() body: RegisterBody) {
    if (!body) throw new BadRequestException('Dados do cadastro ausentes.');
    return this.auth.register({
      name: body.name,
      email: body.email,
      password: body.password,
      businessName: body.businessName,
      serviceMode: body.serviceMode,
      address: body.address,
      meetingUrl: body.meetingUrl,
    });
  }

  // --- Login social: Google ------------------------------------------------

  /** Início do fluxo: o guard redireciona pro consentimento do Google. */
  @Get('oauth/google')
  @UseGuards(GoogleOAuthGuard)
  googleStart() {
    // Nunca executa: o guard já redirecionou pro Google.
  }

  /**
   * Callback do Google. req.user vem da GoogleStrategy (OAuthProfile). Resolve
   * o Owner (login/vínculo/criação), gera um code de uso único e devolve o
   * navegador pro front, que troca o code pelo JWT e seta o cookie. O token
   * nunca viaja na URL — só o code opaco.
   */
  @Get('oauth/google/callback')
  @UseGuards(GoogleOAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    try {
      const profile = req.user as OAuthProfile;
      const ownerId = await this.auth.findOrLinkOrCreateFromOAuth(profile);
      const code = await this.auth.createExchangeCode(ownerId);
      res.redirect(`${webBase()}/painel/oauth/callback?code=${encodeURIComponent(code)}`);
    } catch {
      res.redirect(`${webBase()}/painel/login?erro=google-falhou`);
    }
  }

  /** Troca o code de uso único pela sessão (mesmo shape do login). */
  @Post('oauth/exchange')
  async oauthExchange(@Body() body: { code?: string }) {
    if (!body?.code) throw new BadRequestException('Code ausente.');
    return this.auth.consumeExchangeCode(body.code);
  }
}
