import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

// ---------------------------------------------------------------------------
// Contratos de entrada do painel do dono.
//
// Estas rotas ficam atrás do JwtAuthGuard, então quem chama já provou quem é —
// o que NÃO significa que o corpo seja confiável. Um dono autenticado ainda
// manda número onde se espera texto, string de 2 MB num campo de bio, e
// `slotStepMinutes: "abc"` que desce até o motor de horários. Antes isto tudo
// era `@Body() body: { campo?: tipo }`, um tipo inline que o TypeScript apaga na
// compilação: nada era conferido em tempo de execução.
//
// A regra de tipo mora aqui. A regra de NEGÓCIO continua no panel.service — o
// que é do negócio dele não subiu pra cá.
// ---------------------------------------------------------------------------

const TEXTO_CURTO = 120;
const TEXTO_MEDIO = 254;
const TEXTO_LONGO = 2000;

export class AtualizarPerfilDto {
  @IsOptional() @IsString() @MaxLength(TEXTO_CURTO) name?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(32) cpf?: string;
  @IsOptional() @IsString() @MaxLength(16) cep?: string;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
}

export class TrocarSenhaDto {
  // Opcional porque conta criada por login social ainda não tem senha: nesse
  // caso o dono DEFINE a primeira sem informar a atual. Quem sabe se a conta
  // tem senha é o service, e a decisão continua lá.
  @IsOptional()
  @IsString({ message: 'Senha atual inválida.' })
  @MaxLength(1024)
  currentPassword?: string;

  @IsString({ message: 'Informe a nova senha.' })
  @MinLength(8, { message: 'A senha precisa de ao menos 8 caracteres.' })
  @MaxLength(1024)
  newPassword!: string;
}

export class AtualizarNegocioDto {
  @IsOptional() @IsString() @MaxLength(TEXTO_CURTO) name?: string;
  @IsOptional() @IsString() @MaxLength(TEXTO_CURTO) slug?: string;
  @IsOptional() @IsString() @MaxLength(32) accentColor?: string;
  @IsOptional() @IsString() @MaxLength(TEXTO_LONGO) about?: string;
  @IsOptional() @IsString() @MaxLength(500) instagramUrl?: string;
  @IsOptional() @IsString() @MaxLength(TEXTO_CURTO) profession?: string;
  @IsOptional() @IsString() @MaxLength(64) themePreset?: string;
  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) coverUrl?: string;

  @IsOptional() @IsBoolean() notifyWhatsApp?: boolean;
  @IsOptional() @IsBoolean() notifyEmail?: boolean;
  @IsOptional() @IsBoolean() notifyPush?: boolean;
  @IsOptional() @IsBoolean() notifyOwnerAllBookings?: boolean;
  @IsOptional() @IsBoolean() notifyDailySummary?: boolean;

  @IsOptional() @IsString() @MaxLength(32) ownerWhatsApp?: string;
  @IsOptional() @IsString() @MaxLength(TEXTO_MEDIO) ownerEmail?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;

  @IsOptional()
  @IsIn(['PRESENCIAL', 'REMOTO', 'HIBRIDO'], { message: 'Modo de atendimento inválido.' })
  serviceMode?: string;

  @IsOptional() @IsString() @MaxLength(500) meetingUrl?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;

  // Os tetos abaixo não são preferência: são o que o motor de horários aguenta
  // sem virar um laço absurdo. slotStepMinutes 0 fazia divisão por zero.
  @IsOptional()
  @IsInt({ message: 'Intervalo entre horários inválido.' })
  @Min(1, { message: 'O intervalo entre horários precisa ser de ao menos 1 minuto.' })
  @Max(240, { message: 'O intervalo entre horários não pode passar de 4 horas.' })
  slotStepMinutes?: number;

  @IsOptional()
  @IsInt({ message: 'Antecedência mínima inválida.' })
  @Min(0, { message: 'A antecedência mínima não pode ser negativa.' })
  @Max(43_200, { message: 'A antecedência mínima não pode passar de 30 dias.' })
  minLeadMinutes?: number;

  @IsOptional()
  @IsInt({ message: 'Janela de agendamento inválida.' })
  @Min(1, { message: 'A janela de agendamento precisa ser de ao menos 1 dia.' })
  @Max(730, { message: 'A janela de agendamento não pode passar de 2 anos.' })
  maxAdvanceDays?: number;

  @IsOptional()
  @IsInt({ message: 'Antecedência do lembrete inválida.' })
  @Min(0, { message: 'A antecedência do lembrete não pode ser negativa.' })
  @Max(168, { message: 'O lembrete não pode ser enviado com mais de 7 dias.' })
  reminderHoursBefore?: number;

  @IsOptional()
  @IsInt({ message: 'Prazo de inatividade inválido.' })
  @Min(0, { message: 'O prazo de inatividade não pode ser negativo.' })
  @Max(3650, { message: 'O prazo de inatividade não pode passar de 10 anos.' })
  inactiveDays?: number;

  @IsOptional()
  @IsInt({ message: 'Valor de cliente VIP inválido.' })
  @Min(0, { message: 'O valor de cliente VIP não pode ser negativo.' })
  vipMinSpentCents?: number | null;

  @IsOptional()
  @IsInt({ message: 'Número de visitas inválido.' })
  @Min(0, { message: 'O número de visitas não pode ser negativo.' })
  @Max(1000, { message: 'O número de visitas não pode passar de 1000.' })
  recurringMinVisits?: number;
}

export class AplicarVerticalDto {
  @IsString({ message: 'Escolha um tipo de negócio.' })
  @MinLength(1, { message: 'Escolha um tipo de negócio.' })
  @MaxLength(64)
  vertical!: string;

  @IsOptional() @IsString() @MaxLength(64) skin?: string;
}

export class StatusDoAtendimentoDto {
  @IsIn(['COMPLETED', 'NO_SHOW', 'CONFIRMED'], {
    message: 'status deve ser COMPLETED, NO_SHOW ou CONFIRMED.',
  })
  status!: 'COMPLETED' | 'NO_SHOW' | 'CONFIRMED';
}

export class PagamentoDoAtendimentoDto {
  @IsBoolean({ message: 'paid deve ser true ou false.' })
  paid!: boolean;
}

export class ItemCobradoDto {
  @IsString({ message: 'Todo item precisa de nome.' })
  @MinLength(1, { message: 'Todo item precisa de nome.' })
  @MaxLength(TEXTO_CURTO)
  name!: string;

  // Em centavos e inteiro: preço fracionário aqui vira arredondamento no total
  // do dono. Sem @IsInt, "19.90" passava e o faturamento saía errado por
  // centavos que ninguém consegue explicar depois.
  @IsInt({ message: 'Preço do item inválido.' })
  @Min(0, { message: 'Preço do item não pode ser negativo.' })
  priceCents!: number;

  @IsOptional() @IsString() @MaxLength(64) sourceServiceId?: string | null;
}

export class ItensDoAtendimentoDto {
  @IsArray({ message: 'items deve ser uma lista.' })
  @ValidateNested({ each: true })
  // @Type é do class-transformer e é OBRIGATÓRIO aqui: sem ele cada item chega
  // como objeto cru e o @ValidateNested não tem classe para validar contra —
  // a lista passaria inteira sem conferência nenhuma, que é pior que não ter
  // a trava, porque parece que tem.
  @Type(() => ItemCobradoDto)
  items!: ItemCobradoDto[];
}

export class ObservacaoDoClienteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Observação muito longa (máx. 500).' })
  note?: string;
}
