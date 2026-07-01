import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
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
      cpf: body.cpf,
    });
  }
}
