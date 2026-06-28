import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_FOLLOWUP_DAYS,
  DEFAULT_FOLLOWUP_MESSAGE,
  matchPreset,
} from '../presets/profissoes';

// Modelo leve por padrão (tarefa simples e barata); configurável por env.
const MODEL = process.env.SUGGEST_MODEL ?? 'claude-haiku-4-5';

export interface FollowUpSuggestion {
  followUpDays: number;
  message: string;
  source: 'ai' | 'preset' | 'default';
}

// ---------------------------------------------------------------------------
// Sugere o follow-up de um serviço a partir do que o dono descreve.
// A IA roda só no SETUP (1 chamada por sugestão), nunca no envio. Se não houver
// ANTHROPIC_API_KEY ou a chamada falhar, cai no preset por profissão (determinístico).
// ---------------------------------------------------------------------------
@Injectable()
export class SuggestionService {
  private readonly logger = new Logger(SuggestionService.name);
  private readonly anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  private get aiEnabled() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async suggestFollowUp(input: {
    description: string;
    profession?: string | null;
  }): Promise<FollowUpSuggestion> {
    const description = (input.description ?? '').trim();
    const profession = (input.profession ?? '').trim() || null;

    if (this.aiEnabled && description) {
      try {
        return await this.suggestWithAI(description, profession);
      } catch (err) {
        this.logger.warn(`Sugestão por IA falhou, usando preset: ${(err as Error).message}`);
      }
    }
    return this.suggestFromPreset(description, profession);
  }

  // Camada determinística: casa palavra-chave (serviço + profissão) -> preset.
  private suggestFromPreset(description: string, profession: string | null): FollowUpSuggestion {
    const preset = matchPreset(profession, description);
    if (preset) {
      return { followUpDays: preset.followUpDays, message: preset.message, source: 'preset' };
    }
    return {
      followUpDays: DEFAULT_FOLLOWUP_DAYS,
      message: DEFAULT_FOLLOWUP_MESSAGE,
      source: 'default',
    };
  }

  // Camada esperta: Claude com tool-use forçado -> JSON estruturado e confiável.
  private async suggestWithAI(
    description: string,
    profession: string | null,
  ): Promise<FollowUpSuggestion> {
    const system =
      'Você ajuda um pequeno negócio de serviços (no Brasil) a configurar um lembrete ' +
      'automático de retorno ("follow-up"), enviado por WhatsApp depois que o cliente foi atendido, ' +
      'convidando-o a remarcar. Responda SEMPRE chamando a ferramenta sugerir_follow_up.';

    const userText =
      `Profissão/ramo: ${profession ?? '(não informado)'}\n` +
      `Serviço: ${description}\n\n` +
      'Sugira de quantos em quantos dias faz sentido reconvidar esse cliente (intervalo típico ' +
      'real do ramo) e uma mensagem curta, calorosa e natural em pt-BR. A mensagem DEVE usar os ' +
      'placeholders {nome} (primeiro nome do cliente), {servico} e {negocio}, ter no máximo 2 frases, ' +
      'e pode ter 1 emoji. Não use linguagem formal nem assine.';

    const response = await this.anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system,
      tool_choice: { type: 'tool', name: 'sugerir_follow_up' },
      tools: [
        {
          name: 'sugerir_follow_up',
          description: 'Devolve a sugestão de follow-up para o serviço.',
          input_schema: {
            type: 'object',
            properties: {
              followUpDays: {
                type: 'integer',
                minimum: 1,
                maximum: 365,
                description: 'Dias até reconvidar o cliente.',
              },
              message: {
                type: 'string',
                description: 'Mensagem com {nome}, {servico} e {negocio}.',
              },
            },
            required: ['followUpDays', 'message'],
          },
        },
      ],
      messages: [{ role: 'user', content: userText }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (!toolUse) throw new Error('IA não retornou a ferramenta esperada.');

    const out = toolUse.input as { followUpDays?: unknown; message?: unknown };
    const days = Number(out.followUpDays);
    const message = typeof out.message === 'string' ? out.message.trim() : '';
    if (!Number.isInteger(days) || days < 1 || days > 365 || !message) {
      throw new Error('Sugestão da IA fora do formato esperado.');
    }
    return { followUpDays: days, message, source: 'ai' };
  }
}
