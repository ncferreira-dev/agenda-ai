import assert from 'node:assert';
import type { AppointmentStatus } from '@prisma/client';
import {
  aggregateCustomerStats,
  segmentOf,
  type CustomerStats,
  type AppointmentParaEstatistica,
} from './customers.utils';

// ---------------------------------------------------------------------------
// Testes da regra de CRM do painel. Puro, sem banco. `npm test` roda junto.
//
// Esta regra decide o que o dono lê ao lado do nome de cada cliente — VIP,
// Sumido, Recorrente — e até hoje não tinha teste nenhum, porque morava como
// método privado dentro de um service de 1028 linhas.
// ---------------------------------------------------------------------------

const HOJE = new Date('2026-08-31T12:00:00.000Z');
const dias = (n: number) => new Date(HOJE.getTime() - n * 86_400_000);

function appt(over: Partial<AppointmentParaEstatistica> = {}): AppointmentParaEstatistica {
  return {
    customerId: 'c1',
    status: 'COMPLETED' as AppointmentStatus,
    totalCents: 5000,
    manualPaidAt: HOJE,
    startAt: dias(10),
    ...over,
  };
}

const stats = (over: Partial<CustomerStats> = {}): CustomerStats => ({
  total: 0,
  visits: 0,
  paidCount: 0,
  spentCents: 0,
  firstVisitAt: null,
  lastVisitAt: null,
  ...over,
});

const REGRAS = { inactiveDays: 60, vipMinSpentCents: 30_000, recurringMinVisits: 3 };

const tests: Array<[string, () => void]> = [
  [
    'soma gasto só do que foi pago, e visita só do que foi concluído',
    () => {
      const m = aggregateCustomerStats([
        appt({ status: 'COMPLETED' as AppointmentStatus, manualPaidAt: HOJE, totalCents: 5000 }),
        // concluído e NÃO pago: conta visita, não conta gasto
        appt({ status: 'COMPLETED' as AppointmentStatus, manualPaidAt: null, totalCents: 9900 }),
        // pago e ainda NÃO concluído: conta gasto, não conta visita
        appt({ status: 'CONFIRMED' as AppointmentStatus, manualPaidAt: HOJE, totalCents: 2000 }),
      ]);
      const s = m.get('c1')!;
      assert.strictEqual(s.total, 3);
      assert.strictEqual(s.visits, 2, 'visita é COMPLETED, pago ou não');
      assert.strictEqual(s.paidCount, 2);
      assert.strictEqual(s.spentCents, 7000, 'gasto é o pago (5000+2000), não o concluído');
    },
  ],
  [
    'primeira e última visita saem só das concluídas',
    () => {
      const m = aggregateCustomerStats([
        appt({ startAt: dias(100) }),
        appt({ startAt: dias(5) }),
        // futura e ainda não concluída: não pode virar "última visita"
        appt({ status: 'CONFIRMED' as AppointmentStatus, startAt: dias(-30) }),
      ]);
      const s = m.get('c1')!;
      assert.strictEqual(s.firstVisitAt?.toISOString(), dias(100).toISOString());
      assert.strictEqual(s.lastVisitAt?.toISOString(), dias(5).toISOString());
    },
  ],
  [
    'separa por cliente',
    () => {
      const m = aggregateCustomerStats([appt({ customerId: 'a' }), appt({ customerId: 'b' })]);
      assert.strictEqual(m.size, 2);
      assert.strictEqual(m.get('a')!.total, 1);
    },
  ],
  [
    'sem visita é NOVO, mesmo tendo pago',
    () => {
      const s = stats({ total: 2, paidCount: 2, spentCents: 99_000 });
      assert.deepStrictEqual(segmentOf(REGRAS, s, HOJE), { kind: 'NOVO' });
    },
  ],
  [
    'SUMIDO vence VIP (é a precedência que importa, e a mais fácil de inverter)',
    () => {
      // Gastou muito E sumiu. Marcar como VIP esconderia justamente quem vale a
      // pena chamar de volta.
      const s = stats({ visits: 9, spentCents: 500_000, lastVisitAt: dias(90) });
      assert.deepStrictEqual(segmentOf(REGRAS, s, HOJE), { kind: 'SUMIDO', inactiveDays: 90 });
    },
  ],
  [
    'no limite de inactiveDays ainda NÃO está sumido',
    () => {
      const s = stats({ visits: 1, lastVisitAt: dias(60) });
      assert.strictEqual(segmentOf(REGRAS, s, HOJE).kind, 'NOVO');
      const sumido = stats({ visits: 1, lastVisitAt: dias(61) });
      assert.strictEqual(segmentOf(REGRAS, sumido, HOJE).kind, 'SUMIDO');
    },
  ],
  [
    'VIP vence RECORRENTE',
    () => {
      const s = stats({ visits: 5, spentCents: 30_000, lastVisitAt: dias(1) });
      assert.deepStrictEqual(segmentOf(REGRAS, s, HOJE), { kind: 'VIP' });
    },
  ],
  [
    'vipMinSpentCents null desliga o VIP, não promove todo mundo',
    () => {
      const semVip = { ...REGRAS, vipMinSpentCents: null };
      const s = stats({ visits: 5, spentCents: 900_000, lastVisitAt: dias(1) });
      assert.deepStrictEqual(segmentOf(semVip, s, HOJE), { kind: 'RECORRENTE' });
    },
  ],
  [
    'RECORRENTE a partir do mínimo de visitas, e não antes',
    () => {
      const duas = stats({ visits: 2, lastVisitAt: dias(1) });
      assert.strictEqual(segmentOf(REGRAS, duas, HOJE).kind, 'NOVO');
      const tres = stats({ visits: 3, lastVisitAt: dias(1) });
      assert.strictEqual(segmentOf(REGRAS, tres, HOJE).kind, 'RECORRENTE');
    },
  ],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(e as Error).message}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} teste(s) falharam.`);
  process.exit(1);
}
console.log(`\n${tests.length} testes passaram.`);
