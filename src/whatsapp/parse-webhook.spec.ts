import assert from 'node:assert';
import { CloudApiProvider } from './whatsapp.provider';
import { normalizarTelefone } from '../common/phone';

// ---------------------------------------------------------------------------
// Testes do parse do webhook e da normalização de telefone.
// `npm run test:whatsapp-parse`.
//
// O que isto protege: o roteamento multi-tenant compara o número que a Meta
// manda com o que está gravado em Business.phone. Formatos diferentes = nenhum
// negócio encontrado = mensagem descartada com um warn no log. É a falha mais
// provável no dia de ligar o WhatsApp, e a mais difícil de perceber.
// ---------------------------------------------------------------------------

const provider = new CloudApiProvider();

/** Payload da Meta com um número de negócio no formato dado. */
function webhook(displayPhone: string, from: string, texto = 'oi') {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { display_phone_number: displayPhone },
              messages: [{ id: 'wamid.1', from, type: 'text', text: { body: texto } }],
            },
          },
        ],
      },
    ],
  };
}

/** O normalizador que o painel usa pra gravar Business.phone (mesma regra). */
function comoOPainelGrava(valor: string): string {
  const d = valor.replace(/\D/g, '');
  return d.startsWith('55') ? d : `55${d}`;
}

const tests: Array<[string, () => void]> = [
  [
    'formatos de exibição da Meta chegam no mesmo valor que o painel grava',
    () => {
      const gravado = comoOPainelGrava('(11) 99999-0000');
      for (const daMeta of [
        '5511999990000',
        '+5511999990000',
        '+55 11 99999-0000',
        '55 11 99999 0000',
      ]) {
        const [msg] = provider.parseWebhook(webhook(daMeta, '5511888880000'));
        assert.strictEqual(
          msg.to,
          gravado,
          `"${daMeta}" virou "${msg?.to}", esperado "${gravado}"`,
        );
      }
    },
  ],
  [
    'sem normalizar, o formato com máscara não casaria (é o bug)',
    () => {
      const gravado = comoOPainelGrava('(11) 99999-0000');
      const cru = '+55 11 99999-0000';
      assert.notStrictEqual(cru, gravado, 'o cru não pode ser igual ao gravado');
    },
  ],
  [
    'remetente também é normalizado (senão o cliente vira dois registros)',
    () => {
      const [msg] = provider.parseWebhook(webhook('5511999990000', '+55 11 88888-0000'));
      assert.strictEqual(msg.from, '5511888880000');
    },
  ],
  [
    'número sem DDI ganha o 55',
    () => {
      assert.strictEqual(normalizarTelefone('11999990000'), '5511999990000');
    },
  ],
  [
    'número impossível vira null em vez de rotear errado',
    () => {
      assert.strictEqual(normalizarTelefone('123'), null);
      assert.strictEqual(normalizarTelefone(''), null);
      assert.strictEqual(normalizarTelefone(null), null);
      assert.strictEqual(normalizarTelefone('9'.repeat(20)), null);
    },
  ],
  [
    'mensagem com número inutilizável é descartada, não roteada torto',
    () => {
      assert.strictEqual(provider.parseWebhook(webhook('123', '5511888880000')).length, 0);
      assert.strictEqual(provider.parseWebhook(webhook('5511999990000', 'xx')).length, 0);
    },
  ],
  [
    'só texto passa; áudio e imagem são ignorados (comportamento atual)',
    () => {
      const body = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { display_phone_number: '5511999990000' },
                  messages: [
                    { id: 'w1', from: '5511888880000', type: 'audio' },
                    { id: 'w2', from: '5511888880000', type: 'text', text: { body: 'oi' } },
                  ],
                },
              },
            ],
          },
        ],
      };
      const out = provider.parseWebhook(body);
      assert.strictEqual(out.length, 1);
      assert.strictEqual(out[0].providerMessageId, 'w2');
    },
  ],
  [
    'webhook de status (sem messages) não quebra nem gera mensagem',
    () => {
      const body = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { display_phone_number: '5511999990000' },
                  statuses: [{ id: 'w1', status: 'delivered' }],
                },
              },
            ],
          },
        ],
      };
      assert.deepStrictEqual(provider.parseWebhook(body), []);
    },
  ],
  [
    'payload vazio ou malformado devolve lista vazia',
    () => {
      assert.deepStrictEqual(provider.parseWebhook({}), []);
      assert.deepStrictEqual(provider.parseWebhook(null), []);
      assert.deepStrictEqual(provider.parseWebhook({ entry: [{}] }), []);
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
