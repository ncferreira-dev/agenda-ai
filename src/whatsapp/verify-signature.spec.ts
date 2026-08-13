import assert from 'node:assert';
import { createHmac } from 'node:crypto';
import { verificarAssinatura } from './verify-signature';

// ---------------------------------------------------------------------------
// Testes da verificação de assinatura do webhook da Meta. Puro, sem rede nem
// banco. `npm run test:whatsapp-signature`.
//
// Isto é fronteira de segurança: se afrouxar aqui, o endpoint volta a aceitar
// POST forjado de qualquer origem. Mantenha 100%.
// ---------------------------------------------------------------------------

const SEGREDO = 'app-secret-de-teste';
const CORPO = Buffer.from(JSON.stringify({ entry: [{ changes: [] }] }));

function assinar(corpo: Buffer, segredo: string): string {
  return `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`;
}

const tests: Array<[string, () => void]> = [
  [
    'assinatura correta passa',
    () => {
      const r = verificarAssinatura(CORPO, assinar(CORPO, SEGREDO), SEGREDO);
      assert.strictEqual(r.ok, true);
    },
  ],
  [
    'assinatura de outro segredo é rejeitada',
    () => {
      const r = verificarAssinatura(CORPO, assinar(CORPO, 'segredo-do-atacante'), SEGREDO);
      assert.deepStrictEqual(r, { ok: false, motivo: 'nao-confere' });
    },
  ],
  [
    'corpo adulterado invalida a assinatura (é o ataque que isto existe pra barrar)',
    () => {
      const assinaturaDoOriginal = assinar(CORPO, SEGREDO);
      const adulterado = Buffer.from(JSON.stringify({ entry: [{ changes: ['forjado'] }] }));
      const r = verificarAssinatura(adulterado, assinaturaDoOriginal, SEGREDO);
      assert.deepStrictEqual(r, { ok: false, motivo: 'nao-confere' });
    },
  ],
  [
    'sem header não passa',
    () => {
      assert.deepStrictEqual(verificarAssinatura(CORPO, undefined, SEGREDO), {
        ok: false,
        motivo: 'sem-header',
      });
    },
  ],
  [
    'sem segredo configurado devolve motivo próprio (o controller decide o que fazer)',
    () => {
      assert.deepStrictEqual(verificarAssinatura(CORPO, assinar(CORPO, SEGREDO), undefined), {
        ok: false,
        motivo: 'sem-segredo',
      });
    },
  ],
  [
    'header sem o prefixo sha256= é rejeitado',
    () => {
      const hex = createHmac('sha256', SEGREDO).update(CORPO).digest('hex');
      assert.deepStrictEqual(verificarAssinatura(CORPO, hex, SEGREDO), {
        ok: false,
        motivo: 'formato',
      });
      assert.deepStrictEqual(verificarAssinatura(CORPO, `sha1=${hex}`, SEGREDO), {
        ok: false,
        motivo: 'formato',
      });
    },
  ],
  [
    'assinatura de tamanho diferente não estoura o timingSafeEqual',
    () => {
      assert.deepStrictEqual(verificarAssinatura(CORPO, 'sha256=abcd', SEGREDO), {
        ok: false,
        motivo: 'nao-confere',
      });
    },
  ],
  [
    'corpo vazio ou ausente é rejeitado',
    () => {
      const a = verificarAssinatura(undefined, assinar(CORPO, SEGREDO), SEGREDO);
      const b = verificarAssinatura(Buffer.alloc(0), assinar(CORPO, SEGREDO), SEGREDO);
      assert.deepStrictEqual(a, { ok: false, motivo: 'formato' });
      assert.deepStrictEqual(b, { ok: false, motivo: 'formato' });
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
