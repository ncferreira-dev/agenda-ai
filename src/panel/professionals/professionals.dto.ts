import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

// Contratos de entrada dos profissionais. Ver o cabeçalho de ../panel.dto.ts
// para por que estas rotas, mesmo atrás de login, precisam disto.

export class CriarProfissionalDto {
  @IsString({ message: 'Informe o nome do profissional.' })
  @MinLength(1, { message: 'Informe o nome do profissional.' })
  @MaxLength(120)
  name!: string;

  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(64, { each: true })
  serviceIds?: string[];

  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(32) cpf?: string;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
}

// Na edição todo campo é opcional (PATCH parcial), e entra o `active`.
export class AtualizarProfissionalDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(64, { each: true })
  serviceIds?: string[];
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(32) cpf?: string;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class FaixaDeHorarioDto {
  // 0 = domingo … 6 = sábado. Sem Min/Max, um weekday 9 gravava uma faixa que
  // nenhum dia alcança: o profissional "tem horário" e a agenda aparece vazia.
  @IsInt({ message: 'Dia da semana inválido.' })
  @Min(0, { message: 'Dia da semana inválido.' })
  @Max(6, { message: 'Dia da semana inválido.' })
  weekday!: number;

  // Minutos desde 00:00 no fuso do negócio. 1440 = 24h.
  @IsInt({ message: 'Horário de início inválido.' })
  @Min(0, { message: 'Horário de início inválido.' })
  @Max(1440, { message: 'Horário de início inválido.' })
  startMinute!: number;

  @IsInt({ message: 'Horário de fim inválido.' })
  @Min(0, { message: 'Horário de fim inválido.' })
  @Max(1440, { message: 'Horário de fim inválido.' })
  endMinute!: number;
}

export class DefinirFaixasDto {
  @IsArray({ message: 'faixas deve ser uma lista.' })
  @ValidateNested({ each: true })
  @Type(() => FaixaDeHorarioDto)
  faixas!: FaixaDeHorarioDto[];
}
