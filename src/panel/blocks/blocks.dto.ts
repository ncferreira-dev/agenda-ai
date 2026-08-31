import { IsDateString, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

// Contratos de entrada dos bloqueios de agenda. Ver o cabeçalho de ../panel.dto.ts.

export class CriarBloqueioDto {
  @IsDateString({}, { message: 'Início inválido.' })
  startAt!: string;

  @IsDateString({}, { message: 'Fim inválido.' })
  endAt!: string;

  @IsOptional() @IsString() @MaxLength(200) reason?: string;

  // Ausente = bloqueia o negócio todo.
  @IsOptional() @IsString() @MaxLength(64) professionalId?: string;
}

export class CriarBloqueioRecorrenteDto {
  @IsInt({ message: 'Dia da semana inválido.' })
  @Min(0, { message: 'Dia da semana inválido.' })
  @Max(6, { message: 'Dia da semana inválido.' })
  weekday!: number;

  // 'HH:mm' no fuso do negócio. O service já reparsa e recusa hora impossível;
  // a forma é conferida aqui pra não descer '25:99' até lá.
  @Matches(/^\d{1,2}:\d{2}$/, { message: 'Hora de início inválida (use HH:mm).' })
  start!: string;

  @Matches(/^\d{1,2}:\d{2}$/, { message: 'Hora de fim inválida (use HH:mm).' })
  end!: string;

  @IsOptional() @IsString() @MaxLength(200) reason?: string;
  @IsOptional() @IsString() @MaxLength(64) professionalId?: string;
}
