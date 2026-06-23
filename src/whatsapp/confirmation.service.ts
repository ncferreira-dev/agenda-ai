import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Trata a resposta do lembrete. Regra (Fase 4): um "SIM" confirma direto e
// encerra (barato, sem chamar o modelo). Qualquer outra coisa devolve null ->
// o agente assume (remarcar/cancelar/conversar).
// ---------------------------------------------------------------------------

// Afirmações comuns no WhatsApp. Comparadas com o texto normalizado.
const AFIRMACOES = new Set([
  'sim',
  's',
  'isso',
  'isso ai',
  'confirmo',
  'confirmado',
  'confirma',
  'ok',
  'okay',
  'claro',
  'pode ser',
  'positivo',
  'joia',
  'beleza',
  'blz',
  'com certeza',
  'vou sim',
  'estarei la',
  'to dentro',
  '👍',
  '👍🏻',
  '👍🏼',
  '🙌',
  '✅',
]);

@Injectable()
export class ConfirmationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Se a mensagem confirma um agendamento lembrado, grava e devolve a resposta
   * pronta. Senão, devolve null (deixa o agente tratar).
   */
  async tryHandle(businessId: string, phone: string, text: string): Promise<string | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { businessId_phone: { businessId, phone } },
      select: { id: true, name: true },
    });
    if (!customer) return null;

    // Agendamento futuro, já lembrado e ainda não confirmado pelo cliente.
    const appt = await this.prisma.appointment.findFirst({
      where: {
        businessId,
        customerId: customer.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startAt: { gt: new Date() },
        reminderSentAt: { not: null },
        customerConfirmedAt: null,
      },
      orderBy: { startAt: 'asc' },
      include: { business: true, service: true, professional: true },
    });
    if (!appt) return null;

    // Só age em afirmação; o resto (incl. "não", "remarcar") vai pro agente.
    if (!this.isAffirmation(text)) return null;

    await this.prisma.appointment.update({
      where: { id: appt.id },
      data: { customerConfirmedAt: new Date(), status: 'CONFIRMED' },
    });

    const quando = DateTime.fromJSDate(appt.startAt)
      .setZone(appt.business.timezone)
      .setLocale('pt-BR')
      .toFormat("cccc, dd/LL 'às' HH:mm");
    const primeiroNome = customer.name ? ` ${customer.name.split(' ')[0]}` : '';

    return `Confirmado${primeiroNome}! Te espero ${quando} — ${appt.service.name} com ${appt.professional.name}. 🙌`;
  }

  private isAffirmation(text: string): boolean {
    const norm = text
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // tira acentos
      .replace(/[!.,]+$/g, '') // tira pontuação final
      .trim();
    if (!norm) return false;
    if (AFIRMACOES.has(norm)) return true;
    // "sim, confirmo", "sim!" etc.
    return norm === 'sim' || norm.startsWith('sim ');
  }
}
