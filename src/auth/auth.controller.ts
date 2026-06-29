import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';

interface LoginBody {
  email: string;
  password: string;
}

interface RegisterBody {
  name: string;
  email: string;
  password: string;
  businessName: string;
  cpf: string;
}

interface ForgotPasswordBody {
  email: string;
}

interface ResetPasswordBody {
  token: string;
  password: string;
}

// Login e cadastro do dono. O grosso da validação fica no AuthService.
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

  @Post('register')
  async register(@Body() body: RegisterBody) {
    if (!body) throw new BadRequestException('Dados do cadastro ausentes.');
    return this.auth.register({
      name: body.name,
      email: body.email,
      password: body.password,
      businessName: body.businessName,
      cpf: body.cpf,
    });
  }

  // Resposta sempre genérica (não revela se o email existe).
  // Rate limit por IP: no máx. 5 pedidos a cada 15 min (anti-abuso de envio).
  // Defesa adicional por email (cooldown) fica no AuthService.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordBody) {
    await this.auth.requestPasswordReset(body?.email ?? '');
    return {
      message: 'Se existir uma conta com esse email, enviamos o link de redefinição.',
    };
  }

  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordBody) {
    if (!body?.token || !body?.password) {
      throw new BadRequestException('Informe o token e a nova senha.');
    }
    await this.auth.resetPassword(body.token, body.password);
    return { message: 'Senha redefinida. Faça login com a nova senha.' };
  }
}
