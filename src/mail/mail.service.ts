import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { resolve4 } from 'node:dns/promises';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// ---------------------------------------------------------------------------
// Envio de e-mail via SMTP. Init preguiçoso: sem SMTP_HOST o app sobe normal e
// o envio é no-op. Configure SMTP_* no .env pra ativar.
// ---------------------------------------------------------------------------

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly host = process.env.SMTP_HOST;
  private transporter: Transporter | null = null;
  private readonly from = process.env.SMTP_FROM ?? 'agend.ai <no-reply@agend.ai>';

  async onModuleInit(): Promise<void> {
    if (!this.host) return;

    // O Nodemailer resolve o host sozinho combinando A/AAAA e sorteando um
    // endereço aleatório da lista — no Render (sem rota de saída IPv6) isso
    // falha com ENETUNREACH toda vez que sorteia um IPv6. Resolvendo pra um
    // IPv4 literal aqui, o Nodemailer pula esse sorteio (host já é IP) e a
    // conexão sai sempre por IPv4. `tls.servername` mantém a validação do
    // certificado contra o hostname real (não o IP).
    let host: string = this.host;
    try {
      const [ipv4] = await resolve4(this.host);
      if (ipv4) host = ipv4;
    } catch (err) {
      this.logger.warn(`Não deu pra resolver IPv4 de ${this.host}, usando hostname direto: ${(err as Error).message}`);
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      tls: { servername: this.host },
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
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
        subject: `Agendamento confirmado na ${data.businessName}`,
        text: linhas.join('\n'),
      });
    } catch (err) {
      this.logger.warn(`Falha ao enviar e-mail de confirmação: ${(err as Error).message}`);
    }
  }

  /** Avisa o dono (best-effort) que entrou um agendamento novo. No-op sem SMTP. */
  async sendOwnerNewBooking(
    to: string,
    data: { businessName: string; service: string; professional: string; when: string; customer: string },
  ): Promise<void> {
    if (!this.transporter || !to) return;
    const linhas = [
      `Novo agendamento na ${data.businessName}.`,
      ``,
      `Serviço: ${data.service}`,
      `Profissional: ${data.professional}`,
      `Quando: ${data.when}`,
      `Cliente: ${data.customer}`,
    ];
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: `Novo agendamento: ${data.service} (${data.when})`,
        text: linhas.join('\n'),
      });
    } catch (err) {
      this.logger.warn(`Falha ao avisar dono por e-mail: ${(err as Error).message}`);
    }
  }

  /** Avisa o PROFISSIONAL (best-effort) que ele tem um agendamento novo. No-op sem SMTP. */
  async sendProfessionalNewBooking(
    to: string,
    data: { businessName: string; service: string; when: string; customer: string },
  ): Promise<void> {
    if (!this.transporter || !to) return;
    const linhas = [
      `Você tem um agendamento novo na ${data.businessName}.`,
      ``,
      `Serviço: ${data.service}`,
      `Quando: ${data.when}`,
      `Cliente: ${data.customer}`,
    ];
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: `Novo agendamento seu: ${data.service} (${data.when})`,
        text: linhas.join('\n'),
      });
    } catch (err) {
      this.logger.warn(`Falha ao avisar profissional por e-mail: ${(err as Error).message}`);
    }
  }

  /** Envia (best-effort) o link de redefinição de senha. No-op sem SMTP. */
  async sendPasswordReset(
    to: string,
    data: { businessName: string; link: string; ttlMinutes: number },
  ): Promise<void> {
    if (!this.transporter || !to) return;
    const linhas = [
      `Recebemos um pedido pra redefinir a senha da sua conta agend.ai (${data.businessName}).`,
      ``,
      `Crie uma nova senha por aqui:`,
      data.link,
      ``,
      `O link vale por ${data.ttlMinutes} minutos. Se não foi você, é só ignorar.`,
    ];
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Redefinição de senha — agend.ai',
        text: linhas.join('\n'),
      });
    } catch (err) {
      this.logger.warn(`Falha ao enviar e-mail de redefinição: ${(err as Error).message}`);
    }
  }

  /** Avisa o dono (best-effort) que a cobrança da assinatura falhou. No-op sem SMTP. */
  async sendPaymentFailed(
    to: string,
    data: { businessName: string; planosUrl: string },
  ): Promise<void> {
    if (!this.transporter || !to) return;
    const linhas = [
      `O pagamento da assinatura da ${data.businessName} no agend.ai falhou.`,
      ``,
      `Atualize o cartão pra não perder o acesso ao painel:`,
      data.planosUrl,
    ];
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Pagamento da assinatura falhou — agend.ai',
        text: linhas.join('\n'),
      });
    } catch (err) {
      this.logger.warn(`Falha ao avisar pagamento falhado por e-mail: ${(err as Error).message}`);
    }
  }

  /** Manda ao dono (best-effort) o resumo da agenda do dia. No-op sem SMTP. */
  async sendOwnerDailySummary(
    to: string,
    data: {
      businessName: string;
      dateLabel: string;
      items: { hora: string; service: string; professional: string; customer: string }[];
    },
  ): Promise<void> {
    if (!this.transporter || !to) return;
    const linhas = [
      `Sua agenda de ${data.dateLabel} na ${data.businessName}:`,
      ``,
      ...data.items.map((i) => `${i.hora}  ${i.service} com ${i.professional} (${i.customer})`),
      ``,
      `${data.items.length} agendamento(s).`,
    ];
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: `Agenda de hoje na ${data.businessName}`,
        text: linhas.join('\n'),
      });
    } catch (err) {
      this.logger.warn(`Falha ao enviar resumo diário: ${(err as Error).message}`);
    }
  }
}
