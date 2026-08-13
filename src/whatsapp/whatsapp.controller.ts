import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
  HttpStatus,
  Logger,
  type RawBodyRequest,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AgentService } from '../agent/agent.service';
import { ConfirmationService } from './confirmation.service';
import { CloudApiProvider, type WhatsAppProvider } from './whatsapp.provider';
import { verificarAssinatura } from './verify-signature';

@Controller('webhook/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);
  private provider: WhatsAppProvider;

  constructor(
    private prisma: PrismaService,
    private agent: AgentService,
    private confirmation: ConfirmationService,
    provider: CloudApiProvider,
  ) {
    this.provider = provider;
  }

  /** Verificação do webhook (Meta faz um GET com hub.challenge). */
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    // O token esperado precisa EXISTIR. Sem esta guarda, com a variável vazia e
    // uma query sem hub.verify_token, a comparação vira undefined === undefined
    // (ou "" === "") e o endpoint valida qualquer requisição — deixando um app
    // da Meta que não é o seu apontar pra cá e ser verificado com sucesso.
    const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!esperado) {
      this.logger.error(
        'WHATSAPP_VERIFY_TOKEN não configurada: recusando verificação do webhook.',
      );
      return res.sendStatus(HttpStatus.FORBIDDEN);
    }

    if (mode === 'subscribe' && token === esperado) {
      return res.status(HttpStatus.OK).send(challenge);
    }
    return res.sendStatus(HttpStatus.FORBIDDEN);
  }

  /** Recebe mensagens. Responde 200 rápido e processa. */
  @Post()
  async receive(
    @Body() body: unknown,
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    // Assinatura ANTES de qualquer processamento: sem isso o endpoint aceita
    // POST forjado de qualquer origem e o agente age em cima dele.
    const assinatura = verificarAssinatura(
      req.rawBody,
      req.header('x-hub-signature-256'),
      process.env.WHATSAPP_APP_SECRET,
    );

    if (!assinatura.ok) {
      // Sem segredo configurado: em produção recusa (fail-closed — um webhook
      // aberto é pior que um webhook fora do ar). Em dev deixa passar pra não
      // travar teste local, mas avisa alto.
      if (assinatura.motivo === 'sem-segredo') {
        if (process.env.NODE_ENV === 'production') {
          this.logger.error(
            'WHATSAPP_APP_SECRET não configurada: recusando webhook. Configure o App Secret (Meta > App > Configurações > Básico) pra liberar.',
          );
          return res.sendStatus(HttpStatus.FORBIDDEN);
        }
        this.logger.warn(
          'WHATSAPP_APP_SECRET não configurada: aceitando sem verificar (só vale em dev).',
        );
      } else {
        this.logger.warn(`Webhook rejeitado (assinatura: ${assinatura.motivo}).`);
        return res.sendStatus(HttpStatus.FORBIDDEN);
      }
    }

    // Responde já: a Meta espera 200 em segundos, senão reenvia.
    res.sendStatus(HttpStatus.OK);

    const inbound = this.provider.parseWebhook(body);
    for (const msg of inbound) {
      // Dedupe persistente: tenta registrar a mensagem. Se já existir (P2002),
      // outra entrega/instância já cuidou dela — pula. Sobrevive a restart e a
      // múltiplas instâncias (o Set em memória não fazia nenhum dos dois).
      if (!(await this.claimMessage(msg.providerMessageId))) continue;

      try {
        // Roteia: qual negócio é dono do número que recebeu a mensagem?
        const business = await this.prisma.business.findFirst({
          where: { phone: msg.to },
          select: { id: true },
        });
        if (!business) {
          // Ajuda a configurar: mostra o número que chegou pra você setar em business.phone.
          console.warn(
            `Webhook: nenhum negócio com phone="${msg.to}". Ajuste o phone do negócio pra esse valor.`,
          );
          continue;
        }

        // Resposta de lembrete: um "SIM" confirma direto e encerra (sem agente).
        const confirmacao = await this.confirmation.tryHandle(
          business.id,
          msg.from,
          msg.text,
        );
        const reply =
          confirmacao ??
          (await this.agent.handleMessage({
            businessId: business.id,
            phone: msg.from,
            text: msg.text,
          }));

        await this.provider.sendText(msg.from, reply);
      } catch (err) {
        this.logger.error(`Erro processando mensagem ${msg.providerMessageId}`, err as Error);

        // Libera a reserva do dedupe: a mensagem NÃO foi processada, então não
        // pode ficar marcada como se tivesse sido. Sem isso, uma falha passageira
        // (agente fora do ar, hiccup de rede) descarta a mensagem pra sempre.
        await this.releaseMessage(msg.providerMessageId);

        // E avisa o cliente. Como já respondemos 200 pra Meta, ela não reenvia:
        // sem esta linha o cliente manda mensagem e fica no silêncio absoluto,
        // sem saber se chegou. Se nem isso sair, aí não há mais o que fazer.
        await this.provider
          .sendText(
            msg.from,
            'Ops, tive um problema aqui e não consegui responder agora. Pode mandar de novo?',
          )
          .catch((e) =>
            this.logger.error('Falha ao avisar o cliente sobre o erro', e as Error),
          );
      }
    }
  }

  /**
   * Reserva o processamento de uma mensagem. Devolve true se foi a 1ª vez a
   * registrar (deve processar) e false se já estava registrada (duplicada).
   */
  private async claimMessage(providerMessageId: string): Promise<boolean> {
    try {
      await this.prisma.processedWebhook.create({ data: { providerMessageId } });
      return true;
    } catch (err) {
      // P2002 = violação de unicidade => já processada. Qualquer outro erro,
      // deixa passar pra não perder a mensagem por causa de um hiccup do banco.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return false;
      }
      this.logger.error('Falha no dedupe do webhook, processando mesmo assim', err as Error);
      return true;
    }
  }

  /**
   * Devolve a mensagem pra fila: some o registro de "já processada" pra que uma
   * reentrega da Meta (ou um reprocessamento manual) volte a ser aceita. Falhar
   * aqui não é fatal — o pior caso é a mensagem seguir marcada, que é o
   * comportamento antigo.
   */
  private async releaseMessage(providerMessageId: string): Promise<void> {
    try {
      await this.prisma.processedWebhook.deleteMany({ where: { providerMessageId } });
    } catch (err) {
      this.logger.error('Falha ao liberar a reserva do dedupe', err as Error);
    }
  }
}
