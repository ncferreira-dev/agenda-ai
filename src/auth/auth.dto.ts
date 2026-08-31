import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// ---------------------------------------------------------------------------
// Contratos de entrada das rotas de autenticação.
//
// São CLASSES, e não interfaces, de propósito: o ValidationPipe do Nest só age
// em parâmetro cujo tipo existe em tempo de execução. Enquanto isto aqui era
// `interface LoginBody`, o pipe não via nada e todo campo chegava ao service
// como o cliente mandou — a validação era um punhado de `if (!body?.x)` no
// começo de cada handler, que é fácil de esquecer numa rota nova.
//
// Os limites de tamanho não são enfeite: sem MaxLength, um POST com 10 MB de
// string chega ao argon2 (que é caro de propósito) e ao Postgres.
// ---------------------------------------------------------------------------

// Todo campo de texto passa por aqui: 254 é o teto de um endereço de e-mail
// pela RFC 5321, e serve de teto geral pro que é digitado num formulário.
const TETO_DE_TEXTO = 254;

export class LoginDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(TETO_DE_TEXTO)
  email!: string;

  // Sem MinLength aqui: a senha do login é conferida contra o hash, e exigir
  // tamanho mínimo pra ENTRAR só entregaria "essa senha não é a daqui" a quem
  // está testando. Quem exige 8 é o cadastro.
  @IsString({ message: 'Informe a senha.' })
  @MaxLength(1024)
  password!: string;
}

export class RegisterDto {
  @IsString({ message: 'Informe seu nome.' })
  @MinLength(1, { message: 'Informe seu nome.' })
  @MaxLength(TETO_DE_TEXTO)
  name!: string;

  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(TETO_DE_TEXTO)
  email!: string;

  // 8 é a mesma regra que o AuthService já aplicava. Ela CONTINUA lá: esta
  // camada recusa o que tem forma errada, o service continua dono da regra.
  @IsString({ message: 'Informe a senha.' })
  @MinLength(8, { message: 'A senha precisa de ao menos 8 caracteres.' })
  @MaxLength(1024)
  password!: string;

  @IsString({ message: 'Informe o nome do negócio.' })
  @MinLength(1, { message: 'Informe o nome do negócio.' })
  @MaxLength(TETO_DE_TEXTO)
  businessName!: string;

  // O formulário manda sempre um dos três. Antes, qualquer valor desconhecido
  // caía calado em PRESENCIAL — um negócio remoto cadastrado como presencial
  // por causa de um typo no front, e ninguém fica sabendo.
  @IsOptional()
  @IsIn(['PRESENCIAL', 'REMOTO', 'HIBRIDO'], {
    message: 'Modo de atendimento inválido.',
  })
  serviceMode?: string;

  // O formulário manda string vazia quando o campo não se aplica ao modo
  // escolhido, então tem que aceitar '' — @IsOptional só pula null/undefined.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  meetingUrl?: string;
}

export class ForgotPasswordDto {
  // Sem @IsEmail de propósito: a resposta desta rota é sempre genérica pra não
  // revelar se a conta existe. Recusar com 400 "e-mail inválido" devolveria
  // justamente o sinal que o resto da rota se esforça pra esconder.
  @IsString({ message: 'Informe o e-mail.' })
  @MaxLength(TETO_DE_TEXTO)
  email!: string;
}

export class ResetPasswordDto {
  @IsString({ message: 'Token ausente.' })
  @MinLength(1, { message: 'Token ausente.' })
  @MaxLength(512)
  token!: string;

  @IsString()
  @MinLength(8, { message: 'A senha precisa de ao menos 8 caracteres.' })
  @MaxLength(1024)
  password!: string;
}

export class OAuthExchangeDto {
  @IsString({ message: 'Code ausente.' })
  @MinLength(1, { message: 'Code ausente.' })
  @MaxLength(512)
  code!: string;
}
