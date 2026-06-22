import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { CloudApiProvider } from '../whatsapp/whatsapp.provider';

// ---------------------------------------------------------------------------
// Dispara lembrete X horas antes do horário. É o que reduz falta -> o motivo
// de o dono pagar todo mês. Roda de tempos em tempos e marca o que já enviou.
// ---------------------------------------------------------------------------

const REMINDER_HOURS_BEFORE = 24;

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: CloudApiProvider,
  ) {}

  // A cada 15 min varre quem entra na janela de lembrete.
  @Cron('0 */15 * * * *')
  async sendDueReminders() {
    const now = DateTime.now();
    const windowEnd = now.plus({ hours: REMINDER_HOURS_BEFORE }).toJSDate();

    const due = await this.prisma.appointment.findMany({
      where: {
        status: 'CONFIRMED',
        reminderSentAt: null,
        startAt: { gt: now.toJSDate(), lte: windowEnd },
      },
      include: { customer: true, service: true, professional: true, business: true },
    });

    for (const appt of due) {
      try {
        const when = DateTime.fromJSDate(appt.startAt)
          .setZone(appt.business.timezone)
          .setLocale('pt-BR')
          .toFormat("cccc, dd/LL 'às' HH:mm");

        const text =
          `Oi${appt.customer.name ? ' ' + appt.customer.name.split(' ')[0] : ''}! ` +
          `Lembrete do seu ${appt.service.name} com ${appt.professional.name} ` +
          `na ${appt.business.name}: ${when}. ` +
          `Confirma? Responda SIM pra confirmar ou me chame pra remarcar.`;

        await this.whatsapp.sendText(appt.customer.phone, text);

        await this.prisma.appointment.update({
          where: { id: appt.id },
          data: { reminderSentAt: new Date() },
        });
      } catch (err) {
        this.logger.error(`Falha no lembrete do agendamento ${appt.id}`, err as Error);
      }
    }

    if (due.length) {
      this.logger.log(`Lembretes enviados: ${due.length}`);
    }
  }
}
