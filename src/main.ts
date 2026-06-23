import 'reflect-metadata';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

export const UPLOADS_DIR = join(process.cwd(), 'uploads');

async function bootstrap(): Promise<void> {
  mkdirSync(UPLOADS_DIR, { recursive: true });

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Libera o frontend Next (página pública) a chamar a API do navegador.
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3001',
  });

  // Serve as imagens enviadas (logo/capa) em /uploads.
  app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads/' });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API no ar em http://localhost:${port}`);
}

void bootstrap();
