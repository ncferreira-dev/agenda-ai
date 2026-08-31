import { DiscountKind } from '@prisma/client';
import {
  IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';

// Contratos de entrada dos serviços. Ver o cabeçalho de ../panel.dto.ts.

export class CriarServicoDto {
  @IsString({ message: 'Informe o nome do serviço.' })
  @MinLength(1, { message: 'Informe o nome do serviço.' })
  @MaxLength(120)
  name!: string;

  // Duração 0 fazia o motor de horários gerar slots infinitos no mesmo instante.
  @IsInt({ message: 'Duração inválida.' })
  @Min(1, { message: 'A duração precisa ser de ao menos 1 minuto.' })
  @Max(1440, { message: 'A duração não pode passar de 24 horas.' })
  durationMinutes!: number;

  @IsInt({ message: 'Preço inválido.' })
  @Min(0, { message: 'O preço não pode ser negativo.' })
  priceCents!: number;

  @IsOptional() @IsInt() @Min(0) @Max(3650) followUpDays?: number | null;
  @IsOptional() @IsString() @MaxLength(1000) followUpMessage?: string | null;

  @IsOptional() @IsEnum(DiscountKind, { message: 'Tipo de desconto inválido.' })
  discountKind?: DiscountKind | null;

  @IsOptional() @IsInt() @Min(0) discountValue?: number | null;

  @IsOptional() @IsBoolean() isKit?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(64, { each: true })
  kitMemberIds?: string[];
}

export class AtualizarServicoDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1440) durationMinutes?: number;
  @IsOptional() @IsInt() @Min(0) priceCents?: number;
  @IsOptional() @IsInt() @Min(0) @Max(3650) followUpDays?: number | null;
  @IsOptional() @IsString() @MaxLength(1000) followUpMessage?: string | null;
  @IsOptional() @IsEnum(DiscountKind) discountKind?: DiscountKind | null;
  @IsOptional() @IsInt() @Min(0) discountValue?: number | null;
  @IsOptional() @IsBoolean() isKit?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(64, { each: true })
  kitMemberIds?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}
