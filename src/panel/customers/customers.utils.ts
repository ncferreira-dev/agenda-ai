import type { AppointmentStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Regra de CRM em função pura: dá pra chamar de um arquivo de teste sem subir
// nada. Estava dentro do PanelService, como método privado de uma classe de
// 1028 linhas — o que a tornava, na prática, não testável: exercitá-la exigia
// instanciar o service inteiro com Prisma e BookingService no meio.
//
// É a regra que decide o que o dono vê escrito ao lado do nome do cliente, e
// não tinha um único teste.
// ---------------------------------------------------------------------------

/** Números de CRM acumulados por cliente. */
export interface CustomerStats {
  total: number; // agendamentos não cancelados
  visits: number; // atendimentos concluídos (COMPLETED)
  paidCount: number; // atendimentos pagos
  spentCents: number; // total gasto (soma dos pagos, total editado)
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
}

export const EMPTY_STATS: CustomerStats = {
  total: 0,
  visits: 0,
  paidCount: 0,
  spentCents: 0,
  firstVisitAt: null,
  lastVisitAt: null,
};

export interface AppointmentParaEstatistica {
  customerId: string;
  status: AppointmentStatus;
  totalCents: number;
  manualPaidAt: Date | null;
  startAt: Date;
}

export type SegmentoDoCliente = {
  kind: 'NOVO' | 'SUMIDO' | 'VIP' | 'RECORRENTE';
  inactiveDays?: number;
};

export interface RegrasDeSegmento {
  inactiveDays: number;
  vipMinSpentCents: number | null;
  recurringMinVisits: number;
}

/** Soma por cliente: total de agendamentos, visitas (COMPLETED), gasto (pago), 1ª/última visita. */
export function aggregateCustomerStats(
  appts: AppointmentParaEstatistica[],
): Map<string, CustomerStats> {
  const map = new Map<string, CustomerStats>();
  for (const a of appts) {
    const s = map.get(a.customerId) ?? {
      total: 0,
      visits: 0,
      paidCount: 0,
      spentCents: 0,
      firstVisitAt: null,
      lastVisitAt: null,
    };
    s.total += 1;
    // Pago e concluído são estados SEPARADOS de propósito: o dono pode receber
    // adiantado por um atendimento que ainda não aconteceu, e pode concluir um
    // atendimento que o cliente ainda não pagou.
    if (a.manualPaidAt) {
      s.paidCount += 1;
      s.spentCents += a.totalCents;
    }
    if (a.status === 'COMPLETED') {
      s.visits += 1;
      if (!s.firstVisitAt || a.startAt < s.firstVisitAt) s.firstVisitAt = a.startAt;
      if (!s.lastVisitAt || a.startAt > s.lastVisitAt) s.lastVisitAt = a.startAt;
    }
    map.set(a.customerId, s);
  }
  return map;
}

/**
 * Segmento do cliente (a precedência importa): sem visitas -> Novo; última
 * visita além de inactiveDays -> Sumido; gasto >= vipMinSpentCents -> VIP;
 * visitas >= recurringMinVisits -> Recorrente; senão Novo.
 *
 * Sumido vem ANTES de VIP de propósito: um cliente que gastou muito e sumiu
 * precisa aparecer como sumido, que é a informação acionável. Marcá-lo VIP
 * esconderia justamente quem vale a pena chamar de volta.
 */
export function segmentOf(
  business: RegrasDeSegmento,
  s: CustomerStats,
  now: Date,
): SegmentoDoCliente {
  if (s.visits === 0) return { kind: 'NOVO' };
  if (s.lastVisitAt) {
    const days = Math.floor((now.getTime() - s.lastVisitAt.getTime()) / 86_400_000);
    if (days > business.inactiveDays) return { kind: 'SUMIDO', inactiveDays: days };
  }
  if (business.vipMinSpentCents != null && s.spentCents >= business.vipMinSpentCents) {
    return { kind: 'VIP' };
  }
  if (s.visits >= business.recurringMinVisits) return { kind: 'RECORRENTE' };
  return { kind: 'NOVO' };
}
