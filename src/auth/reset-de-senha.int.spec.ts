import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { criarExtensaoAuditoria } from '../prisma/prisma-audit.extension';
import type { PrismaService } from '../prisma/prisma.service';
import type { MailService } from '../mail/mail.service';
import type { JwtService } from '@nestjs/jwt';

// ---------------------------------------------------------------------------
// RESET DE SENHA e INVALIDAÇÃO DE SESSÃO — integração, contra Postgres.
//
// É o caminho pelo qual alguém retoma o controle da conta. Se ele falhar de um
// lado, o dono fica trancado do próprio negócio; se falhar do outro, um link
// velho continua valendo e vira porta de entrada.
//
// A parte mais fácil de quebrar sem ninguém ver é a INVALIDAÇÃO: trocar a senha
// precisa derrubar as sessões antigas. Sem isso, quem estava logado com a senha
// vazada continua logado — que é justamente o motivo de a pessoa ter trocado.
// ---------------------------------------------------------------------------

const URL_DE_TESTE = execSync('node scripts/banco-de-teste.mjs --url', { encoding: 'utf8' }).trim();
if (!/_teste(\?|$)/.test(URL_DE_TESTE)) {
  console.error(`Recusando rodar: a URL precisa terminar em _teste (veio ${URL_DE_TESTE})`);
  process.exit(1);
}

const base = new PrismaClient({ datasources: { db: { url: URL_DE_TESTE } } });
const prisma = base.$extends(criarExtensaoAuditoria(base)) as unknown as PrismaService;

const mail = { enabled: false } as unknown as MailService;
const jwt = { signAsync: async () => 'token-de-mentira' } as unknown as JwtService;
const auth = new AuthService(prisma, jwt, mail);
const strategy = new JwtStrategy(prisma);

const EMAIL = 'dono@teste.com';
const ids = { business: '00000000-0000-4000-9000-000000000001', owner: '00000000-0000-4000-9000-000000000002' };

async function limpar() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AuditLog","PasswordReset","OAuthAccount","AuthExchange","Owner","Business" CASCADE',
  );
}

async function semear() {
  await limpar();
  await prisma.business.create({
    data: { id: ids.business, name: 'Negócio', slug: 'negocio-teste', timezone: 'America/Sao_Paulo' },
  });
  await prisma.owner.create({
    data: {
      id: ids.owner,
      businessId: ids.business,
      name: 'Dono',
      email: EMAIL,
      passwordHash: await auth.hashPassword('senhaAntiga1'),
    },
  });
}

const hashDoToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** O token cru não é guardado; para testar, geramos um e plantamos o hash. */
async function plantarToken(token: string, over: { expiresAt?: Date; usedAt?: Date } = {}) {
  await prisma.passwordReset.create({
    data: {
      ownerId: ids.owner,
      tokenHash: hashDoToken(token),
      expiresAt: over.expiresAt ?? new Date(Date.now() + 30 * 60_000),
      usedAt: over.usedAt ?? null,
    },
  });
}

const tests: Array<[string, () => Promise<void>]> = [
  [
    'e-mail desconhecido não cria pedido nenhum (e não vaza que não existe)',
    async () => {
      await semear();
      await auth.requestPasswordReset('ninguem@lugar-nenhum.com');
      assert.strictEqual(await prisma.passwordReset.count(), 0);
    },
  ],
  [
    'o token cru NUNCA é gravado — só o hash',
    async () => {
      await semear();
      await auth.requestPasswordReset(EMAIL);
      const [reset] = await prisma.passwordReset.findMany();
      assert.ok(reset, 'o pedido precisa existir');
      // 64 hex = SHA-256. Se um dia alguém gravar o token cru, o banco de
      // reset vira uma lista de chaves das contas.
      assert.match(reset.tokenHash, /^[0-9a-f]{64}$/);
    },
  ],
  [
    'e-mail com espaço e maiúscula acha o mesmo dono',
    async () => {
      await semear();
      await auth.requestPasswordReset('  DONO@TESTE.COM  ');
      assert.strictEqual(await prisma.passwordReset.count(), 1);
    },
  ],
  [
    'COOLDOWN: pedir de novo em seguida não gera segundo link',
    async () => {
      // Sem isto, um formulário clicado dez vezes enche a caixa do dono — e o
      // limite por IP não ajuda, porque o alvo é sempre o mesmo e-mail.
      await semear();
      await auth.requestPasswordReset(EMAIL);
      await auth.requestPasswordReset(EMAIL);
      assert.strictEqual(await prisma.passwordReset.count(), 1);
    },
  ],
  [
    'pedido novo (fora do cooldown) INVALIDA o link anterior',
    async () => {
      // Só um link ativo por vez: o link antigo, que pode ter ido pra uma caixa
      // que a pessoa não controla mais, precisa morrer.
      await semear();
      await plantarToken('token-velho');
      // Envelhece o pedido pra passar do cooldown de 2 min.
      await prisma.passwordReset.updateMany({
        data: { createdAt: new Date(Date.now() - 10 * 60_000) },
      });

      await auth.requestPasswordReset(EMAIL);

      const velho = await prisma.passwordReset.findUnique({
        where: { tokenHash: hashDoToken('token-velho') },
      });
      assert.ok(velho?.usedAt, 'o link anterior precisa ser invalidado');
      const ativos = await prisma.passwordReset.count({ where: { usedAt: null } });
      assert.strictEqual(ativos, 1, 'só pode haver um link ativo');
    },
  ],
  [
    'senha curta é recusada antes de qualquer coisa',
    async () => {
      await semear();
      await plantarToken('token-bom');
      await assert.rejects(() => auth.resetPassword('token-bom', '1234567'));
      // E o token continua valendo: a tentativa fraca não pode queimar o link.
      const reset = await prisma.passwordReset.findUnique({
        where: { tokenHash: hashDoToken('token-bom') },
      });
      assert.strictEqual(reset?.usedAt, null);
    },
  ],
  [
    'token inexistente, USADO e EXPIRADO são todos recusados',
    async () => {
      await semear();
      await plantarToken('ja-usado', { usedAt: new Date() });
      await plantarToken('vencido', { expiresAt: new Date(Date.now() - 60_000) });

      for (const t of ['nao-existe', 'ja-usado', 'vencido']) {
        await assert.rejects(() => auth.resetPassword(t, 'senhaNova123'), `deveria recusar: ${t}`);
      }
    },
  ],
  [
    'token só serve UMA vez',
    async () => {
      await semear();
      await plantarToken('unico');
      await auth.resetPassword('unico', 'senhaNova123');
      await assert.rejects(() => auth.resetPassword('unico', 'outraSenha123'));
    },
  ],
  [
    'trocar a senha DERRUBA as sessões antigas',
    async () => {
      // O coração do fluxo. A pessoa trocou a senha justamente porque a antiga
      // vazou; se quem já estava logado continuar logado, a troca não serviu.
      await semear();
      await plantarToken('t1');
      const emitidoAntes = Math.floor((Date.now() - 60_000) / 1000);

      await auth.resetPassword('t1', 'senhaNova123');

      await assert.rejects(
        () => strategy.validate({ sub: ids.owner, businessId: ids.business, email: EMAIL, iat: emitidoAntes }),
        /Sessão expirada/,
        'token emitido ANTES da troca precisa ser recusado',
      );
    },
  ],
  [
    'a sessão emitida DEPOIS da troca continua valendo',
    async () => {
      // O contrário também importa: derrubar tudo faria a pessoa não conseguir
      // entrar nem com a senha nova.
      await semear();
      await plantarToken('t2');
      await auth.resetPassword('t2', 'senhaNova123');

      const depois = Math.floor((Date.now() + 60_000) / 1000);
      const sessao = await strategy.validate({
        sub: ids.owner, businessId: ids.business, email: EMAIL, iat: depois,
      });
      assert.strictEqual(sessao.ownerId, ids.owner);
    },
  ],
  [
    'a senha nova vale e a antiga não',
    async () => {
      await semear();
      await plantarToken('t3');
      await auth.resetPassword('t3', 'senhaNova123');

      assert.ok(await auth.validateOwner(EMAIL, 'senhaNova123'), 'a senha nova precisa entrar');
      await assert.rejects(() => auth.validateOwner(EMAIL, 'senhaAntiga1'), 'a antiga não pode mais');
    },
  ],
];

async function principal() {
  let falhas = 0;
  for (const [nome, fn] of tests) {
    try {
      await fn();
      console.log(`  ✓ ${nome}`);
    } catch (e) {
      falhas++;
      console.error(`  ✗ ${nome}`);
      console.error(`    ${(e as Error).message}`);
    }
  }
  await limpar();
  await base.$disconnect();
  if (falhas > 0) {
    console.error(`\n${falhas} teste(s) falharam.`);
    process.exit(1);
  }
  console.log(`\n${tests.length} testes passaram.`);
}

void principal();
