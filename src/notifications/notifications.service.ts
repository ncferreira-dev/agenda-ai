import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { CloudApiProvider } from '../whatsapp/whatsapp.provider';
import { MailService } from '../mail/mail.service';

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
  ) {}

  /** Avisa o dono de um agendamento novo. Recarrega tudo por id; best-effort. */
  async notifyNewBooking(appointmentId: string): Promise<void> {
    try {
      const appt = await this.prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
          startAt: true,
          business: { select: BUSINESS_NOTIFY_SELECT },
          service: { select: { name: true } },
          professional: { select: { name: true } },
          customer: { select: { name: true, phone: true } },
        },
      });
      if (!appt) return;

      const { waTo, emailTo } = this.resolveContacts(appt.business);
      const when = this.formatWhen(appt.startAt, appt.business.timezone);
      const cliente = `${appt.customer.name ?? 'sem nome'} (${appt.customer.phone})`;

      if (appt.business.notifyWhatsApp && waTo && process.env.WHATSAPP_TOKEN) {
        const text =
          `🗓️ Novo agendamento na ${appt.business.name}\n` +
          `${appt.service.name} com ${appt.professional.name}\n` +
          `${when}\n` +
          `Cliente: ${cliente}`;
        await this.whatsapp.sendText(waTo, text).catch((e) =>
          this.logger.warn(`WhatsApp do dono falhou: ${(e as Error).message}`),
        );
      }

      if (appt.business.notifyEmail && emailTo && this.mail.enabled) {
        await this.mail.sendOwnerNewBooking(emailTo, {
          businessName: appt.business.name,
          service: appt.service.name,
          professional: appt.professional.name,
          when,
          customer: cliente,
        });
      }
    } catch (err) {
      this.logger.warn(`Falha ao notificar dono (novo agendamento): ${(err as Error).message}`);
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
