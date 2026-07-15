import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { CloudApiProvider } from '../whatsapp/whatsapp.provider';
import { MailService } from '../mail/mail.service';
import { PushService } from '../push/push.service';

// ---------------------------------------------------------------------------
// Notificações PRO DONO. Avisa quando entra um agendamento, pelos canais que o
// negócio ligou (WhatsApp e/ou e-mail). Fire-and-forget: nunca derruba o booking.
// Contato cai pro perfil do dono se o negócio não definiu um específico.
// Tudo escopado por businessId (multi-tenant).
// ---------------------------------------------------------------------------

const BUSINESS_NOTIFY_SELECT = {
  id: true,
  name: true,
  timezone: true,
  notifyWhatsApp: true,
  notifyEmail: true,
  notifyPush: true,
  notifyOwnerAllBookings: true,
  ownerWhatsApp: true,
  ownerEmail: true,
  owners: { select: { phone: true, email: true }, take: 1 },
} as const;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: CloudApiProvider,
    private mail: MailService,
    private push: PushService,
  ) {}

  /**
   * Avisa de um agendamento novo. Recarrega tudo por id; best-effort.
   * Roteamento:
   *  - o PROFISSIONAL do agendamento é sempre avisado (canais dele: e-mail);
   *  - o DONO só é avisado se `notifyOwnerAllBookings` estiver ligado.
   */
  async notifyNewBooking(appointmentId: string): Promise<void> {
    try {
      const appt = await this.prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
          startAt: true,
          business: { select: BUSINESS_NOTIFY_SELECT },
          service: { select: { name: true } },
          professional: { select: { name: true, email: true } },
          customer: { select: { name: true, phone: true } },
        },
      });
      if (!appt) return;

      const when = this.formatWhen(appt.startAt, appt.business.timezone);
      const cliente = `${appt.customer.name ?? 'sem nome'} (${appt.customer.phone})`;

      // 1) Profissional envolvido — sempre. Canal desta fase: e-mail.
      if (appt.professional.email && this.mail.enabled) {
        await this.mail.sendProfessionalNewBooking(appt.professional.email, {
          businessName: appt.business.name,
          service: appt.service.name,
          when,
          customer: cliente,
        });
      }

      // 2) Dono — só se ele optou por receber de TODOS os agendamentos.
      if (appt.business.notifyOwnerAllBookings) {
        await this.notifyOwner(appt.business, {
          service: appt.service.name,
          professional: appt.professional.name,
          when,
          cliente,
          customerName: appt.customer.name,
        });
      }
    } catch (err) {
      this.logger.warn(`Falha ao notificar (novo agendamento): ${(err as Error).message}`);
    }
  }

  /**
   * Avisa o dono que a cobrança da assinatura falhou (webhook Stripe:
   * invoice.payment_failed). Diferente de notifyNewBooking: sempre tenta os
   * dois canais disponíveis (não olha notifyWhatsApp/notifyEmail) — é alerta
   * de billing, não preferência de ruído de agendamento.
   */
  async notifyPaymentFailed(businessId: string): Promise<void> {
    try {
      const business = await this.prisma.business.findUnique({
        where: { id: businessId },
        select: {
          name: true,
          ownerWhatsApp: true,
          ownerEmail: true,
          owners: { select: { phone: true, email: true }, take: 1 },
        },
      });
      if (!business) return;

      const { waTo, emailTo } = this.resolveContacts(business);
      const planosUrl = `${process.env.WEB_ORIGIN ?? 'http://localhost:3001'}/painel/planos`;

      if (waTo && process.env.WHATSAPP_TOKEN) {
        const text =
          `⚠️ O pagamento da sua assinatura do agend.ai falhou.\n` +
          `Atualize o cartão pra não perder o acesso ao painel: ${planosUrl}`;
        await this.whatsapp.sendText(waTo, text).catch((e) =>
          this.logger.warn(`WhatsApp de pagamento falhado falhou: ${(e as Error).message}`),
        );
      }
      if (emailTo && this.mail.enabled) {
        await this.mail.sendPaymentFailed(emailTo, { businessName: business.name, planosUrl });
      }
    } catch (err) {
      this.logger.warn(`Falha ao notificar pagamento falhado: ${(err as Error).message}`);
    }
  }

  // Avisa o dono pelos canais que ele ligou (WhatsApp / e-mail / push).
  private async notifyOwner(
    business: {
      id: string;
      name: string;
      notifyWhatsApp: boolean;
      notifyEmail: boolean;
      notifyPush: boolean;
      ownerWhatsApp: string | null;
      ownerEmail: string | null;
      owners: { phone: string | null; email: string | null }[];
    },
    info: { service: string; professional: string; when: string; cliente: string; customerName: string | null },
  ): Promise<void> {
    const { waTo, emailTo } = this.resolveContacts(business);

    if (business.notifyWhatsApp && waTo && process.env.WHATSAPP_TOKEN) {
      const text =
        `🗓️ Novo agendamento na ${business.name}\n` +
        `${info.service} com ${info.professional}\n` +
        `${info.when}\n` +
        `Cliente: ${info.cliente}`;
      await this.whatsapp.sendText(waTo, text).catch((e) =>
        this.logger.warn(`WhatsApp do dono falhou: ${(e as Error).message}`),
      );
    }

    if (business.notifyEmail && emailTo && this.mail.enabled) {
      await this.mail.sendOwnerNewBooking(emailTo, {
        businessName: business.name,
        service: info.service,
        professional: info.professional,
        when: info.when,
        customer: info.cliente,
      });
    }

    if (business.notifyPush && this.push.enabled) {
      await this.push.notify(business.id, {
        title: `Novo agendamento — ${info.service}`,
        body: `${info.when} · ${info.customerName ?? info.cliente}`,
        url: '/painel',
      });
    }
  }

  // Resolve os contatos do dono: específico do negócio OU o do perfil (fallback).
  resolveContacts(business: {
    ownerWhatsApp: string | null;
    ownerEmail: string | null;
    owners: { phone: string | null; email: string | null }[];
  }): { waTo: string | null; emailTo: string | null } {
    const owner = business.owners[0];
    return {
      waTo: business.ownerWhatsApp ?? owner?.phone ?? null,
      emailTo: business.ownerEmail ?? owner?.email ?? null,
    };
  }

  formatWhen(startAt: Date, timezone: string): string {
    return DateTime.fromJSDate(startAt)
      .setZone(timezone)
      .setLocale('pt-BR')
      .toFormat("cccc, dd/LL 'às' HH:mm");
  }
}
