import { Controller, Get, Post, Body, Query, Res, HttpStatus, Inject } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AgentService } from '../agent/agent.service';
import { CloudApiProvider, type WhatsAppProvider } from './whatsapp.provider';

// Dedupe simples em memória. Em produção, troque por Redis ou tabela de
// mensagens processadas — a Meta reenvia o webhook em caso de timeout.
const processed = new Set<string>();

@Controller('webhook/whatsapp')
export class WhatsAppController {
  private provider: WhatsAppProvider;

  constructor(
    private prisma: PrismaService,
    private agent: AgentService,
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
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(HttpStatus.OK).send(challenge);
    }
    return res.sendStatus(HttpStatus.FORBIDDEN);
  }

  /** Recebe mensagens. Responde 200 rápido e processa. */
  @Post()
  async receive(@Body() body: unknown, @Res() res: Response) {
    // Responde já: a Meta espera 200 em segundos, senão reenvia.
    res.sendStatus(HttpStatus.OK);

    const inbound = this.provider.parseWebhook(body);
    for (const msg of inbound) {
      if (processed.has(msg.providerMessageId)) continue;
      processed.add(msg.providerMessageId);

      try {
        // Roteia: qual negócio é dono do número que recebeu a mensagem?
        const business = await this.prisma.business.findFirst({
          where: { phone: msg.to },
          select: { id: true },
        });
        if (!business) continue;

        const reply = await this.agent.handleMessage({
          businessId: business.id,
          phone: msg.from,
          text: msg.text,
        });

        await this.provider.sendText(msg.from, reply);
      } catch (err) {
        // Logue de verdade no seu observability; aqui só não derruba o loop.
        console.error('Erro processando mensagem:', err);
      }
    }
  }
}
