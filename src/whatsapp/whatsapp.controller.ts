import { Controller, Get, Post, Body, Query, Res, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AgentService } from '../agent/agent.service';
import { ConfirmationService } from './confirmation.service';
import { CloudApiProvider, type WhatsAppProvider } from './whatsapp.provider';

@Controller('webhook/whatsapp')
export class WhatsAppController {
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
        // Logue de verdade no seu observability; aqui só não derruba o loop.
        console.error('Erro processando mensagem:', err);
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
      console.error('Falha no dedupe do webhook, processando mesmo assim:', err);
      return true;
    }
  }
}
