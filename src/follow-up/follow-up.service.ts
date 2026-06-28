import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { CloudApiProvider } from '../whatsapp/whatsapp.provider';
import { DEFAULT_FOLLOWUP_MESSAGE } from '../presets/profissoes';

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

        const text = this.renderMessage(
          appt.service.followUpMessage,
          appt.customer.name,
          appt.service.name,
          appt.business.name,
        );

        await this.whatsapp.sendText(appt.customer.phone, text);
        await this.prisma.appointment.update({
          where: { id: appt.id },
          data: { followUpSentAt: new Date() },
        });
        sent += 1;
      } catch (err) {
        this.logger.error(`Falha no follow-up do agendamento ${appt.id}`, err as Error);
      }
    }

    if (sent) this.logger.log(`Follow-ups enviados: ${sent}`);
  }

  // Marca como tratado sem enviar (já remarcou / velho demais) pra não reavaliar sempre.
  private dismiss(appointmentId: string) {
    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { followUpSentAt: new Date() },
    });
  }

  // Aplica os placeholders {nome}/{servico}/{negocio}. Usa o 1º nome do cliente.
  private renderMessage(
    template: string | null,
    customerName: string | null,
    serviceName: string,
    businessName: string,
  ): string {
    const firstName = customerName?.trim().split(/\s+/)[0] ?? '';
    return (template ?? DEFAULT_FOLLOWUP_MESSAGE)
      .replaceAll('{nome}', firstName || 'tudo bem')
      .replaceAll('{servico}', serviceName)
      .replaceAll('{negocio}', businessName);
  }
}
