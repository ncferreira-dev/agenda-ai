import 'reflect-metadata';
import 'dotenv/config'; // carrega o .env em process.env (ANTHROPIC_API_KEY, WhatsApp, JWT…)
import { mkdirSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { UPLOADS_DIR } from './storage/storage.service';
import { corsOrigins } from './common/env';
import { primeiraMensagemDeErro } from './common/validation';
import { RequestContextInterceptor } from './common/request-context.interceptor';
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

  // Atrás do proxy do Render, TODA request chega com o IP do proxy. Sem isto o
  // rate limit por IP contaria o mundo inteiro como um visitante só: o primeiro
  // a estourar a cota trancaria a porta para todos os outros. Com trust proxy o
  // Express lê o X-Forwarded-For e req.ips passa a ter o IP real do cliente,
  // que é o que o ThrottlerGuard usa. O 1 é a quantidade de proxies à frente
  // (Render põe exatamente um) — number fixo, e não `true`, porque `true`
  // aceitaria um X-Forwarded-For forjado pelo próprio cliente.
  app.set('trust proxy', 1);

  // Validação de entrada na porta, e não espalhada dentro de cada handler.
  //
  //   whitelist            corta todo campo que o DTO não declara. Sem isto um
  //                        POST pode mandar {..., role: 'admin'} e o campo
  //                        viaja junto até quem faz spread em `data`.
  //   forbidNonWhitelisted em vez de cortar em silêncio, recusa com 400 dizendo
  //                        qual campo sobrou. Corte silencioso esconde bug de
  //                        front: o pedido "funciona" e o dado some.
  //   transform            instancia o DTO de verdade (e converte "12" em 12
  //                        quando o tipo declarado é number).
  //
  // Só age em parâmetro tipado com CLASSE. `@Body() b: AlgumaInterface` não é
  // validado, porque interface não existe em tempo de execução — é por isso que
  // o verificador tem uma trava exigindo que todo @Body() use um *.dto.ts.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Sem isto o Nest devolve `message` como ARRAY, em inglês. Todo consumidor
      // aqui — as rotas do Next e as telas — espera `message` string e em
      // português, porque até agora vinha de `new BadRequestException('...')`.
      // Ver src/common/validation.ts para o porquê de cada regra.
      exceptionFactory: (errors) =>
        new BadRequestException(primeiraMensagemDeErro(errors) ?? 'Dados inválidos.'),
    }),
  );

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

  // Abre o contexto de autoria da requisição, que é como a trilha de auditoria
  // descobre quem escreveu. Global: rota nova nasce com autor, sem ninguém
  // precisar lembrar de nada. Ver src/common/request-context.ts.
  app.useGlobalInterceptors(new RequestContextInterceptor());

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API no ar em http://localhost:${port}`);
}

void bootstrap();
