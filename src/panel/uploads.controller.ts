import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Mesma pasta servida estaticamente em /uploads (ver main.ts).
const UPLOADS_DIR = join(process.cwd(), 'uploads');
const PUBLIC_URL = process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

// Upload local de imagens (logo/capa). Camada simples e plugável — dá pra
// trocar por Supabase/R2 depois sem mexer no resto.
@Controller('me/uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
      }),
      limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Envie um arquivo de imagem.'), false);
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    return { url: `${PUBLIC_URL}/uploads/${file.filename}` };
  }
}
