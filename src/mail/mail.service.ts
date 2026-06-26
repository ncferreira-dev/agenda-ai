import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// ---------------------------------------------------------------------------
// Envio de e-mail via SMTP. Init preguiçoso: sem SMTP_HOST o app sobe normal e
// o envio é no-op. Configure SMTP_* no .env pra ativar.
// ---------------------------------------------------------------------------

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from = process.env.SMTP_FROM ?? 'agend.ai <no-reply@agend.ai>';

  constructor() {
    const host = process.env.SMTP_HOST;
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_SECURE === 'true',
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        })
      : null;
  }

  get enabled(): boolean {
    return this.transporter !== null;
  }

  /** Envia (best-effort) a confirmação do agendamento. No-op sem SMTP. */
  async sendBookingConfirmation(
    to: string,
    data: { businessName: string; service: string; professional: string; when: string; address?: string | null },
  ): Promise<void> {
    if (!this.transporter || !to) return;
    const linhas = [
      `Olá! Seu agendamento na ${data.businessName} está confirmado.`,
      ``,
      `Serviço: ${data.service}`,
      `Profissional: ${data.professional}`,
      `Quando: ${data.when}`,
      ...(data.address ? [`Onde: ${data.address}`] : []),
      ``,
      `Até lá! ✂️`,
    ];
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: `Agendamento confirmado — ${data.businessName}`,
        text: linhas.join('\n'),
      });
    } catch (err) {
      this.logger.warn(`Falha ao enviar e-mail de confirmação: ${(err as Error).message}`);
    }
  }
}
