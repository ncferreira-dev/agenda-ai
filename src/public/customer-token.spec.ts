import assert from 'node:assert';
import { createHmac } from 'node:crypto';
import { criarTokenDoCliente, lerTokenDoCliente } from './customer-token';

// ---------------------------------------------------------------------------
// Testes do token de acesso do cliente final. Puro, sem rede nem banco.
// `npm run test:customer-token`.
//
// Isto é fronteira de segurança: é o que separa "vejo meus agendamentos" de
// "vejo os de qualquer um". Se afrouxar aqui, volta o vazamento que o token
// existe pra fechar. Mantenha 100%.
// ---------------------------------------------------------------------------

const SEGREDO = 'jwt-secret-de-teste';
const ACESSO = { businessId: 'negocio-1', customerId: 'cliente-1' };
const AGORA = 1_700_000_000_000; // instante fixo: teste de prazo não pode depender do relógio

const tests: Array<[string, () => void]> = [
  [
    'token recém-emitido devolve o mesmo acesso',
    () => {
      const t = criarTokenDoCliente(ACESSO, SEGREDO, AGORA);
      assert.deepStrictEqual(lerTokenDoCliente(t, SEGREDO, AGORA), ACESSO);
    },
  ],
  [
    'token assinado com outro segredo é rejeitado',
    () => {
      const t = criarTokenDoCliente(ACESSO, 'segredo-do-atacante', AGORA);
      assert.strictEqual(lerTokenDoCliente(t, SEGREDO, AGORA), null);
    },
  ],
  [
    'trocar o customerId no corpo invalida (é o ataque que isto existe pra barrar)',
    () => {
      const t = criarTokenDoCliente(ACESSO, SEGREDO, AGORA);
      const [, assinatura] = t.split('.');
      const forjado = Buffer.from(
        JSON.stringify({ b: 'negocio-1', c: 'cliente-vitima', e: 9_999_999_999 }),
        'utf8',
      ).toString('base64url');
      assert.strictEqual(lerTokenDoCliente(`${forjado}.${assinatura}`, SEGREDO, AGORA), null);
    },
  ],
  [
    'token vencido é rejeitado',
    () => {
      const t = criarTokenDoCliente(ACESSO, SEGREDO, AGORA);
      const umDia = 24 * 60 * 60 * 1000;
      // vale em 179 dias, não vale em 181
      assert.deepStrictEqual(lerTokenDoCliente(t, SEGREDO, AGORA + 179 * umDia), ACESSO);
      assert.strictEqual(lerTokenDoCliente(t, SEGREDO, AGORA + 181 * umDia), null);
    },
  ],
  [
    'a chave é derivada: assinar com o JWT_SECRET cru não passa',
    () => {
      // Se um dia alguém "simplificar" e assinar direto com o segredo do painel,
      // este teste quebra — que é o ponto: os dois usos não podem colidir.
      const corpo = Buffer.from(
        JSON.stringify({ b: 'negocio-1', c: 'cliente-1', e: 9_999_999_999 }),
        'utf8',
      ).toString('base64url');
      const assinaturaCrua = createHmac('sha256', SEGREDO).update(corpo).digest('base64url');
      assert.strictEqual(lerTokenDoCliente(`${corpo}.${assinaturaCrua}`, SEGREDO, AGORA), null);
    },
  ],
  [
    'lixo, vazio e formato errado não passam',
    () => {
      for (const t of [undefined, '', 'sem-ponto', 'a.b.c', '.', 'YWJj.']) {
        assert.strictEqual(lerTokenDoCliente(t as string | undefined, SEGREDO, AGORA), null);
      }
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
