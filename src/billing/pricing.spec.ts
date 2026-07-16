import assert from 'node:assert';
import { DateTime } from 'luxon';
import { getPlan } from './plan-catalog';
import {
  formatBRL,
  hasLaunchTransition,
  launchPricingEndsAt,
  nextRenewalAt,
  quote,
} from './pricing';

// ---------------------------------------------------------------------------
// Testes do motor de preço da assinatura. Puro, sem banco. `npm run test:pricing`.
// Se mexer em pricing.ts, mantenha isto 100%.
// ---------------------------------------------------------------------------

const TZ = 'America/Sao_Paulo';
const START = getPlan('START');
const PRO = getPlan('PRO');

const tests: Array<[string, () => void]> = [
  [
    'formatBRL formata centavos em reais',
    () => {
      assert.strictEqual(formatBRL(5990), 'R$ 59,90');
      assert.strictEqual(formatBRL(4990), 'R$ 49,90');
      assert.strictEqual(formatBRL(0), 'R$ 0,00');
    },
  ],
  [
    'Start não tem transição de preço; Pro tem',
    () => {
      assert.strictEqual(hasLaunchTransition(START), false);
      assert.strictEqual(hasLaunchTransition(PRO), true);
    },
  ],
  [
    'launchPricingEndsAt = subscribedAt + 3 meses (Pro); null (Start)',
    () => {
      const sub = DateTime.fromISO('2026-01-10T12:00', { zone: TZ }).toJSDate();
      const ends = launchPricingEndsAt(sub, TZ, PRO);
      assert.ok(ends);
      const endsDt = DateTime.fromJSDate(ends as Date, { zone: TZ });
      assert.strictEqual(endsDt.toISODate(), '2026-04-10');
      assert.strictEqual(launchPricingEndsAt(sub, TZ, START), null);
    },
  ],
  [
    'nextRenewalAt = subscribedAt + 1 mês',
    () => {
      const sub = DateTime.fromISO('2026-01-31T09:00', { zone: TZ }).toJSDate();
      const next = DateTime.fromJSDate(nextRenewalAt(sub, TZ), { zone: TZ });
      // 31/jan + 1 mês cai em 28/fev (Luxon ajusta o fim de mês).
      assert.strictEqual(next.toISODate(), '2026-02-28');
    },
  ],
  [
    'quote Pro: disclosure promo->cheio, sem nota de 1º mês',
    () => {
      const q = quote({ plan: PRO });
      assert.strictEqual(q.firstChargeCents, 5990);
      assert.strictEqual(q.firstMonthNote, null);
      assert.strictEqual(
        q.disclosureText,
        'R$ 59,90/mês nos 3 primeiros meses, depois R$ 79,90/mês.',
      );
      assert.strictEqual(q.lineItems.length, 1);
    },
  ],
  [
    'quote Start: disclosure sem "depois" (promo permanente)',
    () => {
      const q = quote({ plan: START });
      assert.strictEqual(q.disclosureText, 'R$ 49,90/mês.');
      assert.strictEqual(q.hasTransition, false);
      assert.strictEqual(q.firstChargeCents, 4990);
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
