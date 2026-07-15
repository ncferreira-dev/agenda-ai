import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingGateGuard } from '../billing/billing-gate.guard';
import { StorageService } from '../storage/storage.service';

// Upload de imagens (logo/capa). O arquivo chega em memória e é persistido pelo
// StorageService, que decide o backend por env (disco local em dev, S3-compatível
// em prod). Trocar de storage não mexe neste controller.
@Controller('me/uploads')
@UseGuards(JwtAuthGuard, BillingGateGuard)
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Envie um arquivo de imagem.'), false);
        }
        cb(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    const { url } = await this.storage.put({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
    });
    return { url };
  }
}
