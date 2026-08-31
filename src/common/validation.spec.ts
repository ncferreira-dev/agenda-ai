import assert from 'node:assert';
import type { ValidationError } from 'class-validator';
import { primeiraMensagemDeErro } from './validation';

// ---------------------------------------------------------------------------
// Testes da tradução das mensagens do ValidationPipe. Puro, sem rede nem banco.
// `npm test` roda junto.
// ---------------------------------------------------------------------------

function erro(property: string, constraints: Record<string, string>, children: ValidationError[] = []): ValidationError {
  return { property, constraints, children } as ValidationError;
}

const tests: Array<[string, () => void]> = [
  [
    'devolve a mensagem escrita à mão',
    () => {
      const r = primeiraMensagemDeErro([erro('email', { isEmail: 'Informe um e-mail válido.' })]);
      assert.strictEqual(r, 'Informe um e-mail válido.');
    },
  ],
  [
    'ignora a mensagem automática em inglês (é o defeito que isto existe pra barrar)',
    () => {
      const r = primeiraMensagemDeErro([erro('password', { isString: 'password must be a string' })]);
      assert.strictEqual(r, null);
    },
  ],
  [
    'prefere a escrita à mão quando as duas aparecem juntas',
    () => {
      const r = primeiraMensagemDeErro([
        erro('password', {
          maxLength: 'password must be shorter than or equal to 1024 characters',
          minLength: 'A senha precisa de ao menos 8 caracteres.',
        }),
      ]);
      assert.strictEqual(r, 'A senha precisa de ao menos 8 caracteres.');
    },
  ],
  [
    'campo a mais vira mensagem própria, e não "property X should not exist"',
    () => {
      const r = primeiraMensagemDeErro([
        erro('role', { whitelistValidation: 'property role should not exist' }),
      ]);
      assert.strictEqual(r, 'Pedido com campo não reconhecido.');
    },
  ],
  [
    'encontra a mensagem em erro aninhado',
    () => {
      const r = primeiraMensagemDeErro([
        erro('endereco', {}, [erro('cep', { isString: 'Informe o CEP.' })]),
      ]);
      assert.strictEqual(r, 'Informe o CEP.');
    },
  ],
  [
    'lista vazia e indefinida não quebram',
    () => {
      assert.strictEqual(primeiraMensagemDeErro([]), null);
      assert.strictEqual(primeiraMensagemDeErro(undefined as unknown as ValidationError[]), null);
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
