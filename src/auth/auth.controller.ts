import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

interface LoginBody {
  email: string;
  password: string;
}

// Só login. O registro do dono é feito via seed (decisão do MVP).
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
}
