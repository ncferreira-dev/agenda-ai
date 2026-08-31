import { Type } from 'class-transformer';
import { IsObject, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

// Contrato de entrada das notificações do navegador (Web Push).

export class ChavesDaInscricaoDto {
  @IsString({ message: 'Inscrição de push inválida.' })
  @MinLength(1, { message: 'Inscrição de push inválida.' })
  @MaxLength(255)
  p256dh!: string;

  @IsString({ message: 'Inscrição de push inválida.' })
  @MinLength(1, { message: 'Inscrição de push inválida.' })
  @MaxLength(255)
  auth!: string;
}

export class InscricaoDoNavegadorDto {
  // O endpoint é a URL do serviço de push do navegador; é a chave da linha no
  // banco. Sem MinLength, uma inscrição vazia virava registro que nunca entrega
  // nada e nunca é limpo.
  @IsString({ message: 'Inscrição de push inválida.' })
  @MinLength(1, { message: 'Inscrição de push inválida.' })
  @MaxLength(1000)
  endpoint!: string;

  @IsObject({ message: 'Inscrição de push inválida.' })
  @ValidateNested()
  @Type(() => ChavesDaInscricaoDto)
  keys!: ChavesDaInscricaoDto;
}

export class RegistrarPushDto {
  @IsObject({ message: 'Inscrição de push inválida.' })
  @ValidateNested()
  @Type(() => InscricaoDoNavegadorDto)
  subscription!: InscricaoDoNavegadorDto;
}

export class RemoverPushDto {
  @IsString({ message: 'Inscrição de push inválida.' })
  @MinLength(1, { message: 'Inscrição de push inválida.' })
  @MaxLength(1000)
  endpoint!: string;
}
