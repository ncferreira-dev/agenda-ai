import { Injectable } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Abstração de provider de WhatsApp. Implemente esta interface pra trocar
// entre Cloud API oficial, Evolution API ou Z-API sem tocar no agente.
// ---------------------------------------------------------------------------

export interface InboundMessage {
  /** telefone do cliente em E.164, ex.: 5511999998888 */
  from: string;
  /** número do negócio que recebeu (pra rotear o multi-tenant) */
  to: string;
  text: string;
  /** id da mensagem no provider, p/ dedupe */
  providerMessageId: string;
}

export interface WhatsAppProvider {
  /** Envia texto pro cliente. Só vale DENTRO da janela de 24h (ver sendTemplate). */
  sendText(to: string, text: string): Promise<void>;
  /**
   * Envia template aprovado pela Meta. É o único jeito de falar com o cliente
   * FORA da janela de 24h — lembrete, follow-up e resumo diário caem aí.
   * `params` preenche os {{1}}, {{2}}… do corpo, na ordem.
   */
  sendTemplate(
    to: string,
    nome: string,
    idioma: string,
    params: string[],
  ): Promise<void>;
  /** Normaliza o payload bruto do webhook em InboundMessage[] (pode vir em lote). */
  parseWebhook(body: unknown): InboundMessage[];
}

// --- Implementação: WhatsApp Cloud API (Meta) -----------------------------

@Injectable()
export class CloudApiProvider implements WhatsAppProvider {
  private readonly token = process.env.WHATSAPP_TOKEN ?? '';
  private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  private readonly apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v21.0';

  async sendText(to: string, text: string): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    });
  }

  async sendTemplate(
    to: string,
    nome: string,
    idioma: string,
    params: string[],
  ): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: nome,
        language: { code: idioma },
        components: params.length
          ? [
              {
                type: 'body',
                parameters: params.map((text) => ({ type: 'text', text })),
              },
            ]
          : [],
      },
    });
  }

  /** POST na Graph API com o erro da Meta preservado (é ele que diz o motivo). */
  private async post(payload: unknown): Promise<void> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Falha ao enviar WhatsApp (${res.status}): ${detail}`);
    }
  }

  parseWebhook(body: any): InboundMessage[] {
    const out: InboundMessage[] = [];
    const entries = body?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        const businessPhone = value?.metadata?.display_phone_number ?? '';
        for (const msg of value?.messages ?? []) {
          if (msg.type !== 'text') continue; // por ora só texto
          out.push({
            from: msg.from,
            to: businessPhone,
            text: msg.text?.body ?? '',
            providerMessageId: msg.id,
          });
        }
      }
    }
    return out;
  }
}
