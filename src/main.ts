import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Libera o frontend Next (página pública) a chamar a API do navegador.
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3001',
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API no ar em http://localhost:${port}`);
}

void bootstrap();
