import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { CloudApiProvider } from '../whatsapp/whatsapp.provider';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from './notifications.service';

// ---------------------------------------------------------------------------
// Resumo diário (opcional): toda manhã manda ao dono a lista de agendamentos do
// dia, pelos canais que ele ligou. Espelha o reminder/follow-up: cron de hora em
// hora, dispara quando bate a hora local do negócio. Se não há agenda no dia, não
// manda nada (evita ruído). Multi-tenant rígido.
// ---------------------------------------------------------------------------

// Hora de envio no fuso de cada negócio (default 7h; ajustável por env).
const SUMMARY_HOUR = () => Number(process.env.DAILY_SUMMARY_HOUR ?? 7);

@Injectable()
export class DailySummaryService {
  private readonly logger = new Logger(DailySummaryService.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: CloudApiProvider,
    private mail: MailService,
    private notifications: NotificationsService,
  ) {}

  @Cron('0 0 * * * *')
  async sendDailySummaries() {
    const now = DateTime.now();

    const businesses = await this.prisma.business.findMany({
      where: { notifyDailySummary: true },
      select: {
        id: true,
        name: true,
        timezone: true,
        notifyWhatsApp: true,
        notifyEmail: true,
        ownerWhatsApp: true,
        ownerEmail: true,
        lastDailySummaryAt: true,
        owners: { select: { phone: true, email: true }, take: 1 },
      },
    });

    let sent = 0;
    for (const b of businesses) {
      try {
        const local = now.setZone(b.timezone);
        if (local.hour !== SUMMARY_HOUR()) continue;

        // Já mandou hoje (no fuso do negócio)? Não repete.
        if (b.lastDailySummaryAt) {
          const last = DateTime.fromJSDate(b.lastDailySummaryAt).setZone(b.timezone);
          if (last.hasSame(local, 'day')) continue;
        }

        const dayStart = local.startOf('day');
        const dayEnd = dayStart.plus({ days: 1 });
        const appts = await this.prisma.appointment.findMany({
          where: {
            businessId: b.id, // multi-tenant
            status: { in: ['PENDING', 'CONFIRMED'] },
            startAt: { gte: dayStart.toUTC().toJSDate(), lt: dayEnd.toUTC().toJSDate() },
          },
          orderBy: { startAt: 'asc' },
          select: {
            startAt: true,
            service: { select: { name: true } },
            professional: { select: { name: true } },
            customer: { select: { name: true } },
          },
        });

        if (appts.length === 0) continue; // sem agenda hoje: não manda (decisão do dono)

        const { waTo, emailTo } = this.notifications.resolveContacts(b);
        const dateLabel = dayStart.setLocale('pt-BR').toFormat("cccc, dd/LL");
        const items = appts.map((a) => ({
          hora: DateTime.fromJSDate(a.startAt).setZone(b.timezone).toFormat('HH:mm'),
          service: a.service.name,
          professional: a.professional.name,
          customer: a.customer.name ?? 'sem nome',
        }));

        if (b.notifyWhatsApp && waTo && process.env.WHATSAPP_TOKEN) {
          const linhas = items.map((i) => `• ${i.hora} ${i.service} com ${i.professional} (${i.customer})`);
          const text =
            `☀️ Sua agenda de hoje na ${b.name}\n${dateLabel}\n\n` +
            `${linhas.join('\n')}\n\n${appts.length} agendamento(s).`;
          await this.whatsapp.sendText(waTo, text).catch((e) =>
            this.logger.warn(`Resumo WhatsApp falhou (${b.id}): ${(e as Error).message}`),
          );
        }

        if (b.notifyEmail && emailTo && this.mail.enabled) {
          await this.mail.sendOwnerDailySummary(emailTo, { businessName: b.name, dateLabel, items });
        }

        await this.prisma.business.update({
          where: { id: b.id },
          data: { lastDailySummaryAt: new Date() },
        });
        sent += 1;
      } catch (err) {
        this.logger.warn(`Falha no resumo diário (${b.id}): ${(err as Error).message}`);
      }
    }

    if (sent) this.logger.log(`Resumos diários enviados: ${sent}`);
  }
}
