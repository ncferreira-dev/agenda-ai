import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { BookingService } from '../booking/booking.service';
import { TOOLS, ToolExecutor, type AgentContext } from './tools';

const MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-4-6';
const MAX_TOOL_TURNS = 6; // trava de segurança contra loop infinito

@Injectable()
export class AgentService {
  // Init preguiçoso: sem ANTHROPIC_API_KEY o app sobe normal (a página de
  // agendamento não depende de IA); só o agente do WhatsApp exige a chave.
  private anthropic: Anthropic | null = null;
  private executor: ToolExecutor;

  private getAnthropic(): Anthropic {
    if (!this.anthropic) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new ServiceUnavailableException(
          'Agente indisponível: configure ANTHROPIC_API_KEY no servidor.',
        );
      }
      this.anthropic = new Anthropic({ apiKey });
    }
    return this.anthropic;
  }

  constructor(
    private prisma: PrismaService,
    availability: AvailabilityService,
    booking: BookingService,
  ) {
    this.executor = new ToolExecutor(prisma, availability, booking);
  }

  private systemPrompt(businessName: string, timezone: string): string {
    const now = DateTime.now().setZone(timezone).setLocale('pt-BR');
    return [
      `Você é o atendente virtual da ${businessName}, agendando por WhatsApp.`,
      `Hoje é ${now.toFormat("cccc, dd/LL/yyyy")} e agora são ${now.toFormat('HH:mm')} (${timezone}).`,
      ``,
      `Regras:`,
      `- Fale em português do Brasil, curto e direto, jeito de WhatsApp. Sem textão.`,
      `- Para descobir horários, SEMPRE use consultar_disponibilidade. Nunca invente horário.`,
      `- Resolva "amanhã", "sábado", "semana que vem" para a data YYYY-MM-DD usando a data de hoje acima.`,
      `- Antes de criar o agendamento, confirme com o cliente: serviço, profissional, dia e hora.`,
      `- Se o cliente não escolher profissional, ofereça os disponíveis ou sugira um.`,
      `- Se faltar o nome do cliente na primeira marcação, pergunte de leve.`,
      `- Se der conflito ao agendar, peça desculpa e ofereça os próximos horários livres.`,
      `- Se criar_agendamento responder aguardandoPagamento, mande o linkPagamento pro cliente e avise que o horário só fica garantido após pagar o sinal (reserva de 15 min).`,
    ].join('\n');
  }

  /**
   * Processa uma mensagem recebida e devolve o texto a ser enviado de volta.
   * Persiste o histórico da conversa pra manter contexto multi-turn.
   */
  async handleMessage(params: {
    businessId: string;
    phone: string;
    text: string;
  }): Promise<string> {
    const { businessId, phone, text } = params;

    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const customer = await this.prisma.customer.upsert({
      where: { businessId_phone: { businessId, phone } },
      create: { businessId, phone },
      update: {},
    });

    const conversation = await this.prisma.conversation.upsert({
      where: { businessId_phone: { businessId, phone } },
      create: { businessId, phone, customerId: customer.id, messages: [] },
      update: { customerId: customer.id },
    });

    const ctx: AgentContext = {
      businessId,
      timezone: business.timezone,
      customerId: customer.id,
      phone,
    };

    // conversation.messages é Json no Prisma; gravamos sempre como MessageParam[].
    const history = (conversation.messages as unknown as Anthropic.MessageParam[]) ?? [];
    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: 'user', content: text },
    ];

    let finalText = '';

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const response = await this.getAnthropic().messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: this.systemPrompt(business.name, business.timezone),
        tools: TOOLS,
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUses.length === 0) {
        finalText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        break;
      }

      // Executa cada ferramenta e devolve os resultados.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const result = await this.executor.run(tu.name, tu.input, ctx);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: result,
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    if (!finalText) {
      finalText = 'Desculpa, tive um problema aqui. Pode repetir, por favor?';
    }

    // Persiste o histórico (limita p/ não crescer infinito).
    const trimmed = messages.slice(-40);
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { messages: trimmed as any },
    });

    return finalText;
  }
}
