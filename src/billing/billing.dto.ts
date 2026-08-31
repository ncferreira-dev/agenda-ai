import { IsString, MaxLength, MinLength } from 'class-validator';

// Contrato de entrada da cobrança.
//
// Antes era `@Body('planId') planId: string`, que extrai a propriedade solta.
// O ValidationPipe não valida parâmetro primitivo: `{planId: {"$ne": null}}`
// chegava como objeto num lugar tipado como string, e ia direto pro lookup de
// plano. Um DTO devolve a conferência.
export class EscolherPlanoDto {
  @IsString({ message: 'Escolha um plano.' })
  @MinLength(1, { message: 'Escolha um plano.' })
  @MaxLength(64)
  planId!: string;
}
