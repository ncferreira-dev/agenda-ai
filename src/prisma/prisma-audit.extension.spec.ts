import assert from 'node:assert';
import { semSegredosParaAuditoria, businessIdDaLinha } from './prisma-audit.extension';

// ---------------------------------------------------------------------------
// Testes das funções puras da trilha de auditoria. `npm test` roda junto.
//
// A primeira é fronteira de SEGURANÇA: é o que impede o hash de senha e o hash
// de CPF de serem copiados para dentro do audit_log, numa tabela que ninguém
// trata como sensível e que vai inteira para o backup diário. Mantenha 100%.
// ---------------------------------------------------------------------------

const tests: Array<[string, () => void]> = [
  [
    'esconde o hash de senha (é o vazamento que isto existe pra barrar)',
    () => {
      const r = semSegredosParaAuditoria({
        id: 'o1',
        email: 'ze@barbearia.com',
        passwordHash: '$argon2id$v=19$m=65536...',
      }) as Record<string, unknown>;
      assert.strictEqual(r.passwordHash, '[oculto]');
      // O resto continua legível: a trilha precisa dizer o que mudou.
      assert.strictEqual(r.email, 'ze@barbearia.com');
    },
  ],
  [
    'esconde cpfHash, tokenHash e as chaves de push',
    () => {
      const r = semSegredosParaAuditoria({
        cpfHash: 'abc',
        tokenHash: 'def',
        p256dh: 'ghi',
        auth: 'jkl',
      }) as Record<string, unknown>;
      assert.deepStrictEqual(r, {
        cpfHash: '[oculto]',
        tokenHash: '[oculto]',
        p256dh: '[oculto]',
        auth: '[oculto]',
      });
    },
  ],
  [
    'substitui em vez de omitir, pra distinguir "não tinha" de "tinha e escondi"',
    () => {
      const semSenha = semSegredosParaAuditoria({ passwordHash: null }) as Record<string, unknown>;
      const comSenha = semSegredosParaAuditoria({ passwordHash: 'x' }) as Record<string, unknown>;
      assert.ok('passwordHash' in semSenha, 'a chave precisa continuar existindo');
      assert.strictEqual(semSenha.passwordHash, null);
      assert.strictEqual(comSenha.passwordHash, '[oculto]');
    },
  ],
  [
    'alcança segredo aninhado e dentro de lista',
    () => {
      const r = semSegredosParaAuditoria({
        dono: { passwordHash: 'x' },
        dispositivos: [{ p256dh: 'y' }, { p256dh: 'z' }],
      }) as { dono: Record<string, unknown>; dispositivos: Array<Record<string, unknown>> };
      assert.strictEqual(r.dono.passwordHash, '[oculto]');
      assert.deepStrictEqual(
        r.dispositivos.map((d) => d.p256dh),
        ['[oculto]', '[oculto]'],
      );
    },
  ],
  [
    'preserva Date (senão o retrato perde a hora)',
    () => {
      const d = new Date('2026-08-31T12:00:00.000Z');
      const r = semSegredosParaAuditoria({ startAt: d }) as Record<string, unknown>;
      assert.ok(r.startAt instanceof Date);
      assert.strictEqual((r.startAt as Date).toISOString(), d.toISOString());
    },
  ],
  [
    'o tenant vem da própria linha, não do contexto',
    () => {
      // O agendamento público não tem JWT: o contexto não sabe o tenant, mas a
      // linha sabe. Se isto inverter, o agendamento do cliente é gravado no
      // negócio errado — ou em nenhum.
      assert.strictEqual(businessIdDaLinha('Appointment', { businessId: 'b1' }, undefined), 'b1');
      assert.strictEqual(businessIdDaLinha('Appointment', { businessId: 'b1' }, 'b2'), 'b1');
    },
  ],
  [
    'o Business é o próprio tenant (não tem coluna businessId)',
    () => {
      assert.strictEqual(businessIdDaLinha('Business', { id: 'b9' }, undefined), 'b9');
    },
  ],
  [
    'sem tenant na linha, cai no contexto; sem os dois, null',
    () => {
      assert.strictEqual(businessIdDaLinha('Owner', { id: 'o1' }, 'b3'), 'b3');
      assert.strictEqual(businessIdDaLinha('Owner', { id: 'o1' }, undefined), null);
      assert.strictEqual(businessIdDaLinha('Owner', null, undefined), null);
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
