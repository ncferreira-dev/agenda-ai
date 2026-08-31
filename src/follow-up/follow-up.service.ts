import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { CloudApiProvider } from '../whatsapp/whatsapp.provider';
import { renderFollowUpMessage } from './render-message';

// ---------------------------------------------------------------------------
// Follow-up de retorno: depois que um atendimento foi CONCLUÍDO, espera o
// intervalo do serviço (followUpDays) e convida o cliente a remarcar pelo
// WhatsApp — desde que ele ainda NÃO tenha um próximo horário do mesmo serviço.
// Espelha o reminder.service.ts. Tudo escopado por businessId. A IA não roda
// aqui: usamos a mensagem que o dono já salvou no serviço (ou o template padrão).
// ---------------------------------------------------------------------------

const LEAD_DAYS = 2; // dispara até 2 dias antes da data ideal
const GRACE_DAYS = 14; // mais velho que isso: dispensa sem enviar (não ressuscita antigo)
const SEND_HOUR_START = 9; // só envia entre 9h e 20h no fuso do negócio
const SEND_HOUR_END = 20;

// Template aprovado na Meta pro follow-up (mesma lógica do lembrete: fora da
// janela de 24h só template passa). Params na ordem: nome, serviço, negócio.
// Sem ele, cai no sendText (renderFollowUpMessage) — só funciona DENTRO da janela.
const TEMPLATE_FOLLOWUP = () => process.env.WHATSAPP_TEMPLATE_FOLLOWUP;
const TEMPLATE_LANG = () => process.env.WHATSAPP_TEMPLATE_LANG ?? 'pt_BR';

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger(FollowUpService.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: CloudApiProvider,
  ) {}

  // De hora em hora varre os concluídos que entraram na janela de retorno.
  @Cron('0 0 * * * *')
  async sendDueFollowUps() {
    // Sem WhatsApp configurado não há como enviar — não roda (nem marca).
    if (!process.env.WHATSAPP_TOKEN) return;

    const now = DateTime.now();

    // Candidatos: atendimento concluído, serviço com follow-up ligado, ainda não enviado.
    const candidates = await this.prisma.appointment.findMany({
      where: {
        status: 'COMPLETED',
        followUpSentAt: null,
        service: { followUpDays: { not: null } },
      },
      include: { customer: true, service: true, business: true },
    });

    let sent = 0;
    for (const appt of candidates) {
      try {
        const days = appt.service.followUpDays!;
        const due = DateTime.fromJSDate(appt.startAt).plus({ days });

        // Ainda não chegou na janela (faltam mais que LEAD_DAYS): deixa pra depois.
        if (now < due.minus({ days: LEAD_DAYS })) continue;

        // Velho demais (passou da janela + carência): dispensa sem enviar.
        if (now > due.plus({ days: GRACE_DAYS })) {
          await this.dismiss(appt.id);
          continue;
        }

        // Cliente já remarcou o MESMO serviço? (futuro ativo) -> dispensa sem enviar.
        const alreadyRebooked = await this.prisma.appointment.findFirst({
          where: {
            businessId: appt.businessId, // multi-tenant rígido
            customerId: appt.customerId,
            serviceId: appt.serviceId,
            status: { in: ['PENDING', 'CONFIRMED'] },
            startAt: { gt: now.toJSDate() },
          },
          select: { id: true },
        });
        if (alreadyRebooked) {
          await this.dismiss(appt.id);
          continue;
        }

        // Fora do horário amigável no fuso do negócio: tenta no próximo tick.
        const localHour = now.setZone(appt.business.timezone).hour;
        if (localHour < SEND_HOUR_START || localHour >= SEND_HOUR_END) continue;

        // A partir daqui vamos ENVIAR: marca followUpSentAt após a tentativa
        // (sucesso ou falha) pra não retentar de hora em hora contra uma falha
        // permanente (template não aprovado, fora da janela) — o que degradaria
        // a nota do número. As saídas por continue/dismiss acima NÃO passam aqui,
        // então "ainda não deu a hora" continua sendo reavaliado depois.
        try {
          await this.enviarFollowUp(appt);
          sent += 1;
        } finally {
          await this.prisma.appointment
            .update({ where: { id: appt.id }, data: { followUpSentAt: new Date() } })
            .catch((e) =>
              this.logger.error(`Falha ao marcar followUpSentAt (${appt.id})`, e as Error),
            );
        }
      } catch (err) {
        this.logger.error(`Falha no follow-up do agendamento ${appt.id}`, err as Error);
      }
    }

    if (sent) this.logger.log(`Follow-ups enviados: ${sent}`);
  }

  private async enviarFollowUp(appt: {
    customer: { phone: string; name: string | null };
    service: { name: string; followUpMessage: string | null };
    business: { name: string };
  }): Promise<void> {
    const template = TEMPLATE_FOLLOWUP();
    if (template) {
      const primeiroNome = appt.customer.name ? appt.customer.name.split(' ')[0] : '';
      await this.whatsapp.sendTemplate(appt.customer.phone, template, TEMPLATE_LANG(), [
        primeiroNome,
        appt.service.name,
        appt.business.name,
      ]);
      return;
    }
    // Sem template: a mensagem que o dono salvou (ou o padrão). Só chega DENTRO
    // da janela de 24h.
    const text = renderFollowUpMessage(
      appt.service.followUpMessage,
      appt.customer.name,
      appt.service.name,
      appt.business.name,
    );
    await this.whatsapp.sendText(appt.customer.phone, text);
  }

  // Marca como tratado sem enviar (já remarcou / velho demais) pra não reavaliar sempre.
  private dismiss(appointmentId: string) {
    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { followUpSentAt: new Date() },
    });
  }
}
