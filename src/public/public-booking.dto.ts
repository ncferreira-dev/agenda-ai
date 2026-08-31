import { IsDateString, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// ---------------------------------------------------------------------------
// Contratos de entrada da superfície pública. É a parte da API que qualquer um
// na internet alcança sem login, então é onde validar na porta rende mais.
//
// Cada limite aqui tem motivo. Sem MaxLength, o campo `notes` de um agendamento
// aceita um romance inteiro e ele vai pro banco e pro corpo da notificação; sem
// MinLength no telefone, o normalizePhone monta "55" e cria um Customer órfão
// que nunca mais casa com ninguém.
// ---------------------------------------------------------------------------

export class CriarAgendamentoDto {
  @IsString({ message: 'Serviço não informado.' })
  @MinLength(1, { message: 'Serviço não informado.' })
  @MaxLength(64)
  serviceId!: string;

  @IsString({ message: 'Profissional não informado.' })
  @MinLength(1, { message: 'Profissional não informado.' })
  @MaxLength(64)
  professionalId!: string;

  // O horário vem do /availability, que devolve ISO com offset. Aceitar texto
  // livre aqui fazia uma data torta descer até o motor de slots e voltar como
  // erro de fuso, que é caro de diagnosticar.
  @IsDateString({}, { message: 'Horário inválido.' })
  startAt!: string;

  @IsString({ message: 'Informe seu nome.' })
  @MinLength(1, { message: 'Informe seu nome.' })
  @MaxLength(120)
  name!: string;

  // Só dígitos, com ou sem DDI: quem normaliza pra E.164 é o servidor. 10 é o
  // mínimo de um fixo com DDD; 13 cobre 55 + DDD + 9 dígitos.
  @Matches(/^\+?\d{10,13}$/, { message: 'Informe um telefone válido com DDD.' })
  phone!: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido.' })
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Observação muito longa (máx. 500).' })
  notes?: string;
}

// O token é OPCIONAL nos dois DTOs abaixo, e isso é deliberado: token ausente é
// falta de credencial, que se responde com 401 — quem decide isso é o handler.
// Exigir aqui devolveria 400, misturando "você não mandou credencial" com "seu
// pedido está malformado". O papel do DTO nestes dois é outro e continua
// valendo: garantir que veio STRING, pra que `?token[]=a&token[]=b` (que o
// Express entrega como array) não chegue ao leitor de token.
export class CancelarAgendamentoDto {
  @IsOptional()
  @IsString({ message: 'Link inválido ou expirado.' })
  @MaxLength(512)
  token?: string;
}

export class ConsultarAgendamentosDto {
  @IsOptional()
  @IsString({ message: 'Link inválido ou expirado.' })
  @MaxLength(512)
  token?: string;
}

export class ConsultarDisponibilidadeDto {
  @IsString({ message: 'serviceId e date são obrigatórios.' })
  @MinLength(1, { message: 'serviceId e date são obrigatórios.' })
  @MaxLength(64)
  serviceId!: string;

  // Dia civil no fuso do negócio, no formato que a tela monta.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data inválida (use AAAA-MM-DD).' })
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  professionalId?: string;
}
