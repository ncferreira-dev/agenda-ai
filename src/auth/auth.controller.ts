import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, type OAuthProfile } from './auth.service';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { webOrigin } from '../common/env';
import {
  LoginDto,
  RegisterDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  OAuthExchangeDto,
} from './auth.dto';

// O guard de rate limit vale para o controller inteiro porque aqui não existe
// rota "inofensiva": todas são anônimas e todas aceitam palpite. Deixar o guard
// rota a rota foi o que deixou login e reset-password sem limite nenhum
// enquanto só o forgot-password estava protegido.
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private auth: AuthService) {}

  // Senha por tentativa: sem teto, um dicionário roda contra a conta do dono a
  // noite inteira. 10 por 15 min por IP não incomoda quem só errou o teclado.
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('login')
  async login(@Body() body: LoginDto) {
    // O `if (!body?.email || !body?.password)` que existia aqui saiu porque o
    // LoginDto agora garante os dois na porta. A regra não sumiu: mudou de um
    // if no começo do handler para uma declaração que vale pra rota inteira.
    return this.auth.login(body.email, body.password);
  }

  /** Cadastro público do dono: cria o negócio e já devolve a sessão. */
  // Cadastro cria negócio + dono no banco. 5 por hora por IP evita que alguém
  // encha a base de tenants fantasma com um laço de terminal.
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @Post('register')
  async register(@Body() body: RegisterDto) {
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

  // Resposta sempre genérica (não revela se o email existe).
  // Rate limit por IP: no máx. 5 pedidos a cada 15 min (anti-abuso de envio).
  // Defesa adicional por email (cooldown) fica no AuthService.
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    await this.auth.requestPasswordReset(body.email);
    return {
      message: 'Se existir uma conta com esse email, enviamos o link de redefinição.',
    };
  }

  // O token de reset é adivinhável por força bruta se puder ser testado sem fim.
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto) {
    await this.auth.resetPassword(body.token, body.password);
    return { message: 'Senha redefinida. Faça login com a nova senha.' };
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
      res.redirect(`${webOrigin()}/painel/oauth/callback?code=${encodeURIComponent(code)}`);
    } catch (e) {
      // Sem log, erros distintos (conta já existe com outro provedor, falha de
      // rede na troca, etc.) sumiam sem rastro — impossível diagnosticar por que
      // o login social falhou. O usuário segue vendo o erro genérico.
      this.logger.error('Falha no callback do OAuth do Google', e as Error);
      res.redirect(`${webOrigin()}/painel/login?erro=google-falhou`);
    }
  }

  /** Troca o code de uso único pela sessão (mesmo shape do login). */
  // Mesmo motivo do reset: é um code de uso único que vale uma sessão inteira.
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('oauth/exchange')
  async oauthExchange(@Body() body: OAuthExchangeDto) {
    return this.auth.consumeExchangeCode(body.code);
  }
}
