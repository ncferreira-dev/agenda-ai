import 'reflect-metadata';
import 'dotenv/config'; // carrega o .env em process.env (ANTHROPIC_API_KEY, WhatsApp, JWT…)
import { mkdirSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { UPLOADS_DIR } from './storage/storage.service';
import { corsOrigins } from './common/env';
import { setDefaultResultOrder } from 'node:dns';

// Preferir IPv4 ao resolver nomes. O Render não tem rota de saída por IPv6:
// sem isto, o Node resolve hosts externos (ex.: smtp.gmail.com) para um
// endereço IPv6 e a conexão morre com ENETUNREACH antes mesmo de autenticar.
// Vale pro processo todo — e-mail, Stripe e qualquer outra chamada externa.
setDefaultResultOrder('ipv4first');

async function bootstrap(): Promise<void> {
  // rawBody: true preserva o corpo bruto de TODA request (em req.rawBody) sem
  // deixar de parsear o JSON normalmente — o webhook do Stripe precisa dos
  // bytes originais pra verificar a assinatura (stripe.webhooks.constructEvent).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Libera o(s) frontend(s) Next a chamar a API do navegador. WEB_ORIGIN é
  // obrigatória em produção (falha no boot se faltar) e aceita várias origens
  // separadas por vírgula.
  app.enableCors({
    origin: corsOrigins(),
  });

  // Com storage S3-compatível as imagens não ficam no disco: nada a servir aqui.
  // No backend local (dev/sem S3_BUCKET), serve as imagens enviadas em /uploads.
  if (!process.env.S3_BUCKET) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
    app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads/' });
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API no ar em http://localhost:${port}`);
}

void bootstrap();
