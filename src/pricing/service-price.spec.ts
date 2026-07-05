import assert from 'node:assert';
import { effectivePriceCents, hasDiscount, type Priceable } from './service-price';

// ---------------------------------------------------------------------------
// Testes do preço efetivo. Puro, sem banco. Rode com `npm run test:pricing-service`.
// ---------------------------------------------------------------------------

const p = (over: Partial<Priceable>): Priceable => ({
  priceCents: 10000,
  discountKind: null,
  discountValue: 0,
  ...over,
});

const tests: Array<[string, () => void]> = [
  [
    'sem desconto -> preço cheio',
    () => {
      assert.strictEqual(effectivePriceCents(p({})), 10000);
      assert.strictEqual(hasDiscount(p({})), false);
    },
  ],
  [
    'PERCENT 10% de R$100 -> R$90',
    () => {
      assert.strictEqual(effectivePriceCents(p({ discountKind: 'PERCENT', discountValue: 10 })), 9000);
      assert.strictEqual(hasDiscount(p({ discountKind: 'PERCENT', discountValue: 10 })), true);
    },
  ],
  [
    'PERCENT arredonda pro centavo (33% de 999 = 669,33 -> 669)',
    () => {
      assert.strictEqual(effectivePriceCents(p({ priceCents: 999, discountKind: 'PERCENT', discountValue: 33 })), 669);
    },
  ],
  [
    'FIXED R$15 abatidos de R$100 -> R$85',
    () => {
      assert.strictEqual(effectivePriceCents(p({ discountKind: 'FIXED', discountValue: 1500 })), 8500);
    },
  ],
  [
    'FIXED maior que o preço trava em 0',
    () => {
      assert.strictEqual(effectivePriceCents(p({ priceCents: 1000, discountKind: 'FIXED', discountValue: 5000 })), 0);
    },
  ],
  [
    'PERCENT 100% -> 0',
    () => {
      assert.strictEqual(effectivePriceCents(p({ discountKind: 'PERCENT', discountValue: 100 })), 0);
    },
  ],
  [
    'valor 0 ou negativo é ignorado (sem desconto)',
    () => {
      assert.strictEqual(effectivePriceCents(p({ discountKind: 'PERCENT', discountValue: 0 })), 10000);
      assert.strictEqual(effectivePriceCents(p({ discountKind: 'FIXED', discountValue: -100 })), 10000);
    },
  ],
  [
    'preço 0 continua 0 com qualquer desconto',
    () => {
      assert.strictEqual(effectivePriceCents(p({ priceCents: 0, discountKind: 'PERCENT', discountValue: 50 })), 0);
      assert.strictEqual(hasDiscount(p({ priceCents: 0, discountKind: 'FIXED', discountValue: 500 })), false);
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
