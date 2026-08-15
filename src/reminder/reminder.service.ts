import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { CloudApiProvider } from '../whatsapp/whatsapp.provider';

// ---------------------------------------------------------------------------
// Dispara lembrete X horas antes do horário. É o que reduz falta -> o motivo
// de o dono pagar todo mês. Roda de tempos em tempos e marca o que já enviou.
// ---------------------------------------------------------------------------

const MAX_REMINDER_HOURS = 168; // teto de busca (7 dias); cada negócio usa o seu

// Template aprovado na Meta pro lembrete. Fora da janela de 24h (que é o caso do
// lembrete, sempre horas/dias antes), só template passa — sendText volta erro
// 131047. Configure na Meta e aponte por env; sem ele, cai no sendText (só
// funciona em teste, DENTRO da janela). Params na ordem: nome, serviço,
// profissional, negócio, quando.
const TEMPLATE_LEMBRETE = () => process.env.WHATSAPP_TEMPLATE_LEMBRETE;
const TEMPLATE_LANG = () => process.env.WHATSAPP_TEMPLATE_LANG ?? 'pt_BR';

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
    // Sem número de WhatsApp configurado não há como enviar — não roda o loop
    // (nem marca como enviado), pra os lembretes pendentes dispararem quando o
    // WhatsApp entrar no ar.
    if (!process.env.WHATSAPP_TOKEN) return;

    const now = DateTime.now();
    const windowEnd = now.plus({ hours: MAX_REMINDER_HOURS }).toJSDate();

    // Busca candidatos numa janela ampla e filtra pelo lembrete de cada negócio.
    const candidates = await this.prisma.appointment.findMany({
      where: {
        status: 'CONFIRMED',
        reminderSentAt: null,
        startAt: { gt: now.toJSDate(), lte: windowEnd },
      },
      include: { customer: true, service: true, professional: true, business: true },
    });
    const due = candidates.filter(
      (a) => DateTime.fromJSDate(a.startAt) <= now.plus({ hours: a.business.reminderHoursBefore }),
    );

    for (const appt of due) {
      try {
        await this.enviarLembrete(appt);
      } catch (err) {
        this.logger.error(`Falha no lembrete do agendamento ${appt.id}`, err as Error);
      } finally {
        // Marca SEMPRE após a tentativa (sucesso OU falha). Antes só marcava no
        // sucesso: uma falha permanente (template não aprovado, fora da janela)
        // fazia o cron retentar a cada 15 min pra sempre, degradando a nota de
        // qualidade do número na Meta. Lembrete é best-effort: no máximo uma
        // tentativa por agendamento.
        await this.prisma.appointment
          .update({ where: { id: appt.id }, data: { reminderSentAt: new Date() } })
          .catch((e) =>
            this.logger.error(`Falha ao marcar reminderSentAt (${appt.id})`, e as Error),
          );
      }
    }

    if (due.length) {
      this.logger.log(`Lembretes processados: ${due.length}`);
    }
  }

  private async enviarLembrete(appt: {
    startAt: Date;
    customer: { phone: string; name: string | null };
    service: { name: string };
    professional: { name: string };
    business: { name: string; timezone: string };
  }): Promise<void> {
    const when = DateTime.fromJSDate(appt.startAt)
      .setZone(appt.business.timezone)
      .setLocale('pt-BR')
      .toFormat("cccc, dd/LL 'às' HH:mm");
    const primeiroNome = appt.customer.name ? appt.customer.name.split(' ')[0] : '';

    const template = TEMPLATE_LEMBRETE();
    if (template) {
      // Caminho de produção: template aprovado, o único que passa fora da janela.
      await this.whatsapp.sendTemplate(appt.customer.phone, template, TEMPLATE_LANG(), [
        primeiroNome,
        appt.service.name,
        appt.professional.name,
        appt.business.name,
        when,
      ]);
      return;
    }

    // Sem template: texto livre. Só chega DENTRO da janela de 24h (teste/dev).
    const text =
      `Oi${primeiroNome ? ' ' + primeiroNome : ''}! ` +
      `Lembrete do seu ${appt.service.name} com ${appt.professional.name} ` +
      `na ${appt.business.name}: ${when}. ` +
      `Confirma? Responda SIM pra confirmar ou me chame pra remarcar.`;
    await this.whatsapp.sendText(appt.customer.phone, text);
  }
}
