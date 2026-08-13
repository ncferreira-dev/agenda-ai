import assert from 'node:assert';
import type Anthropic from '@anthropic-ai/sdk';
import { recortarHistorico } from './history';

// ---------------------------------------------------------------------------
// Testes do recorte de histórico. Puro, sem rede nem banco.
// `npm run test:agent-history`.
//
// O que isto protege: um corte na fronteira errada faz a API recusar TODA
// mensagem seguinte daquele cliente, pra sempre. Ver history.ts.
// ---------------------------------------------------------------------------

const fala = (texto: string): Anthropic.MessageParam => ({ role: 'user', content: texto });

const usaFerramenta = (id: string): Anthropic.MessageParam => ({
  role: 'assistant',
  content: [{ type: 'tool_use', id, name: 'consultar_disponibilidade', input: {} }],
});

const devolveFerramenta = (id: string): Anthropic.MessageParam => ({
  role: 'user',
  content: [{ type: 'tool_result', tool_use_id: id, content: '09:00, 09:30' }],
});

const responde = (texto: string): Anthropic.MessageParam => ({
  role: 'assistant',
  content: texto,
});

/** Um turno completo: cliente fala, agente consulta, ferramenta responde, agente fala. */
function turno(i: number): Anthropic.MessageParam[] {
  return [
    fala(`mensagem ${i}`),
    usaFerramenta(`tool_${i}`),
    devolveFerramenta(`tool_${i}`),
    responde(`resposta ${i}`),
  ];
}

/** Turno em que o agente consulta duas vezes antes de responder (6 mensagens). */
function turnoDuplo(i: number): Anthropic.MessageParam[] {
  return [
    fala(`mensagem ${i}`),
    usaFerramenta(`tool_${i}a`),
    devolveFerramenta(`tool_${i}a`),
    usaFerramenta(`tool_${i}b`),
    devolveFerramenta(`tool_${i}b`),
    responde(`resposta ${i}`),
  ];
}

/** As duas regras que a API impõe pro primeiro item do histórico. */
function comecoValido(ms: Anthropic.MessageParam[]): boolean {
  const primeira = ms[0];
  if (!primeira || primeira.role !== 'user') return false;
  if (typeof primeira.content === 'string') return true;
  return !primeira.content.some((b) => b.type === 'tool_result');
}

const tests: Array<[string, () => void]> = [
  [
    'histórico menor que o limite passa inteiro',
    () => {
      const ms = turno(1);
      assert.deepStrictEqual(recortarHistorico(ms, 40), ms);
    },
  ],
  [
    'o corte antigo (slice) produzia começo inválido — é o bug',
    () => {
      // Só quebra quando o tamanho do turno não alinha com o limite. Turno de 4
      // com limite 40 cai certo por coincidência; um turno que consulta a agenda
      // duas vezes (6 mensagens) desalinha e o corte pousa num tool_result órfão.
      const ms = Array.from({ length: 10 }, (_, i) => turnoDuplo(i)).flat(); // 60
      const antigo = ms.slice(-40); // índice 20 = devolveFerramenta do turno 3
      assert.strictEqual(
        comecoValido(antigo),
        false,
        'esperava o slice quebrado — se passou, o cenário mudou',
      );
      assert.strictEqual(recortarHistorico(ms, 40).length <= 40, true);
      assert.strictEqual(comecoValido(recortarHistorico(ms, 40)), true);
    },
  ],
  [
    'nenhum tamanho de turno produz começo inválido com o corte novo',
    () => {
      for (const construir of [turno, turnoDuplo]) {
        const ms = Array.from({ length: 12 }, (_, i) => construir(i)).flat();
        for (let max = 1; max <= ms.length; max++) {
          assert.strictEqual(
            comecoValido(recortarHistorico(ms, max)),
            true,
            `turno ${construir.name}, limite ${max}`,
          );
        }
      }
    },
  ],
  [
    'o corte novo sempre começa numa fala do cliente',
    () => {
      const ms = Array.from({ length: 15 }, (_, i) => turno(i)).flat();
      const novo = recortarHistorico(ms, 40);
      assert.strictEqual(comecoValido(novo), true);
      assert.ok(novo.length <= 40, `recortou pra ${novo.length}, esperado <= 40`);
    },
  ],
  [
    'nunca começa num tool_result órfão, em nenhum tamanho de limite',
    () => {
      const ms = Array.from({ length: 15 }, (_, i) => turno(i)).flat();
      for (let max = 1; max <= ms.length; max++) {
        const r = recortarHistorico(ms, max);
        assert.strictEqual(
          comecoValido(r),
          true,
          `limite ${max} produziu começo inválido (${r[0]?.role})`,
        );
      }
    },
  ],
  [
    'preserva o fim da conversa (o contexto recente é o que importa)',
    () => {
      const ms = Array.from({ length: 15 }, (_, i) => turno(i)).flat();
      const r = recortarHistorico(ms, 40);
      assert.deepStrictEqual(r[r.length - 1], ms[ms.length - 1]);
    },
  ],
  [
    'sem fronteira segura, guarda tudo em vez de cortar errado',
    () => {
      // Ciclo de ferramentas sem nenhuma fala nova do cliente depois do corte.
      const ms: Anthropic.MessageParam[] = [
        fala('oi'),
        ...Array.from({ length: 10 }, (_, i) => [
          usaFerramenta(`t${i}`),
          devolveFerramenta(`t${i}`),
        ]).flat(),
      ];
      const r = recortarHistorico(ms, 5);
      assert.deepStrictEqual(r, ms, 'deveria devolver tudo em vez de um começo inválido');
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
