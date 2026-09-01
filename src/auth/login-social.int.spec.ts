import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { PrismaClient, OAuthProvider } from '@prisma/client';
import { execSync } from 'node:child_process';
import { AuthService, type OAuthProfile } from './auth.service';
import { criarExtensaoAuditoria } from '../prisma/prisma-audit.extension';
import type { PrismaService } from '../prisma/prisma.service';
import type { MailService } from '../mail/mail.service';
import type { JwtService } from '@nestjs/jwt';

// ---------------------------------------------------------------------------
// LOGIN SOCIAL (Google) — integração, contra Postgres.
//
// findOrLinkOrCreateFromOAuth decide, a partir de um perfil que veio de FORA,
// se aquilo é (1) login de uma conta já vinculada, (2) VÍNCULO com uma conta
// que já existe com aquele email, ou (3) uma conta nova.
//
// O caminho 2 é o perigoso. Vincular por email é dizer "quem provou esse email
// no Google é o dono desta conta aqui". Se o provedor não garantir que o email
// foi verificado, qualquer um cria uma conta Google com o email do outro e
// entra no negócio alheio — sequestro de conta, sem senha, sem rastro.
//
// O guard é uma linha (`profile.emailVerified`) em dois lugares: no caminho 2 e
// no catch de corrida do caminho 3. Apagar qualquer um dos dois não quebra
// nada visível. Por isso os dois têm teste próprio aqui.
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

const EMAIL = 'dono@teste.com';
const ids = {
  business: '00000000-0000-4000-9000-000000000001',
  owner: '00000000-0000-4000-9000-000000000002',
};

async function limpar() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AuditLog","PasswordReset","OAuthAccount","AuthExchange","Owner","Business" CASCADE',
  );
}

/** Dono que já existe por email+senha — o alvo de um vínculo (ou de um sequestro). */
async function semearDonoComSenha() {
  await limpar();
  await prisma.business.create({
    data: { id: ids.business, name: 'Negócio', slug: 'negocio-teste' },
  });
  await prisma.owner.create({
    data: {
      id: ids.owner,
      businessId: ids.business,
      name: 'Dono',
      email: EMAIL,
      passwordHash: await auth.hashPassword('senhaForte1'),
    },
  });
}

function perfil(over: Partial<OAuthProfile> = {}): OAuthProfile {
  return {
    provider: OAuthProvider.GOOGLE,
    providerAccountId: 'google-sub-123',
    email: EMAIL,
    emailVerified: true,
    name: 'Dono da Silva',
    ...over,
  };
}

const contar = async () => ({
  negocios: await prisma.business.count(),
  donos: await prisma.owner.count(),
  vinculos: await prisma.oAuthAccount.count(),
});

const tests: Array<[string, () => Promise<void>]> = [
  [
    'perfil já vinculado entra no MESMO dono (não cria uma segunda conta)',
    async () => {
      await semearDonoComSenha();
      await prisma.oAuthAccount.create({
        data: {
          ownerId: ids.owner,
          provider: OAuthProvider.GOOGLE,
          providerAccountId: 'google-sub-123',
          email: EMAIL,
        },
      });

      const ownerId = await auth.findOrLinkOrCreateFromOAuth(perfil());
      assert.strictEqual(ownerId, ids.owner);
      assert.deepStrictEqual(await contar(), { negocios: 1, donos: 1, vinculos: 1 });
    },
  ],
  [
    'o vínculo manda mais que o email: perfil vinculado entra mesmo se o email mudou no Google',
    async () => {
      await semearDonoComSenha();
      await prisma.oAuthAccount.create({
        data: {
          ownerId: ids.owner,
          provider: OAuthProvider.GOOGLE,
          providerAccountId: 'google-sub-123',
          email: EMAIL,
        },
      });

      // A pessoa trocou o email no Google. O "sub" é estável, então continua
      // sendo a mesma pessoa — e não pode virar uma conta nova.
      const ownerId = await auth.findOrLinkOrCreateFromOAuth(
        perfil({ email: 'outro-email@teste.com' }),
      );
      assert.strictEqual(ownerId, ids.owner);
      assert.deepStrictEqual(await contar(), { negocios: 1, donos: 1, vinculos: 1 });
    },
  ],
  [
    'email VERIFICADO que casa com conta existente VINCULA em vez de duplicar',
    async () => {
      await semearDonoComSenha();

      const ownerId = await auth.findOrLinkOrCreateFromOAuth(perfil({ emailVerified: true }));

      assert.strictEqual(ownerId, ids.owner, 'deveria entrar na conta que já existe');
      assert.deepStrictEqual(
        await contar(),
        { negocios: 1, donos: 1, vinculos: 1 },
        'vincular não pode criar um segundo negócio',
      );
      const vinculo = await prisma.oAuthAccount.findFirstOrThrow();
      assert.strictEqual(vinculo.ownerId, ids.owner);

      // E a senha antiga continua valendo: vincular não derruba o outro login.
      const logado = await auth.validateOwner(EMAIL, 'senhaForte1');
      assert.strictEqual(logado.id, ids.owner);
    },
  ],
  [
    'email NÃO verificado NÃO entra na conta alheia (sequestro de conta)',
    async () => {
      await semearDonoComSenha();

      // Alguém criou uma conta Google declarando o email do dono, sem provar
      // que é dele. Se isto vincular, entrou no negócio do outro.
      await assert.rejects(
        () => auth.findOrLinkOrCreateFromOAuth(perfil({ emailVerified: false })),
        /já tem conta/i,
        'perfil com email não verificado não pode entrar nem criar conta',
      );

      assert.deepStrictEqual(
        await contar(),
        { negocios: 1, donos: 1, vinculos: 0 },
        'não pode ter sobrado vínculo nem negócio criado na tentativa',
      );
    },
  ],
  [
    'email não verificado também não vincula pela porta dos fundos (o catch da corrida)',
    async () => {
      await semearDonoComSenha();

      // O caminho 3 tenta criar a conta, esbarra no @unique do email e cai no
      // catch de P2002 — que tem um SEGUNDO `emailVerified`. Este teste é o que
      // guarda aquele segundo guard: sem ele, o vínculo acontece aqui.
      await assert.rejects(() =>
        auth.findOrLinkOrCreateFromOAuth(
          perfil({ emailVerified: false, providerAccountId: 'outro-sub-999' }),
        ),
      );

      const vinculos = await prisma.oAuthAccount.count({ where: { ownerId: ids.owner } });
      assert.strictEqual(vinculos, 0, 'o dono existente não pode ter ganhado um vínculo');
    },
  ],
  [
    'email novo cria negócio + dono sem senha, em trial e com onboarding pendente',
    async () => {
      await limpar();
      const ownerId = await auth.findOrLinkOrCreateFromOAuth(
        perfil({ email: 'novo@teste.com', name: 'Joana Prado' }),
      );

      const dono = await prisma.owner.findUniqueOrThrow({ where: { id: ownerId } });
      assert.strictEqual(dono.email, 'novo@teste.com');
      assert.strictEqual(dono.passwordHash, null, 'login social não define senha');

      const negocio = await prisma.business.findUniqueOrThrow({ where: { id: dono.businessId } });
      assert.strictEqual(negocio.subscriptionStatus, 'TRIALING');
      assert.ok(negocio.trialEndsAt, 'conta social também nasce com trial');
      assert.strictEqual(negocio.onboardedAt, null, 'o wizard ainda precisa rodar');
      assert.ok(negocio.slug.length >= 3, `slug inválido: ${negocio.slug}`);

      assert.deepStrictEqual(await contar(), { negocios: 1, donos: 1, vinculos: 1 });
    },
  ],
  [
    'dono criado por social não entra por email/senha — é orientado ao Google',
    async () => {
      await limpar();
      await auth.findOrLinkOrCreateFromOAuth(perfil({ email: 'novo@teste.com' }));

      await assert.rejects(
        () => auth.validateOwner('novo@teste.com', 'qualquer-senha'),
        /login social/i,
        'sem senha cadastrada, a mensagem precisa apontar o caminho certo',
      );
    },
  ],
  [
    'entrar duas vezes com o mesmo perfil não cria dois donos',
    async () => {
      await limpar();
      const a = await auth.findOrLinkOrCreateFromOAuth(perfil({ email: 'novo@teste.com' }));
      const b = await auth.findOrLinkOrCreateFromOAuth(perfil({ email: 'novo@teste.com' }));

      assert.strictEqual(a, b);
      assert.deepStrictEqual(await contar(), { negocios: 1, donos: 1, vinculos: 1 });
    },
  ],
  [
    'perfil sem email e sem vínculo é recusado com orientação (não cria conta anônima)',
    async () => {
      await limpar();
      await assert.rejects(
        () => auth.findOrLinkOrCreateFromOAuth(perfil({ email: null })),
        /não retornou um email/i,
      );
      assert.deepStrictEqual(await contar(), { negocios: 0, donos: 0, vinculos: 0 });
    },
  ],
  [
    'perfil sem email MAS já vinculado entra normalmente',
    async () => {
      await semearDonoComSenha();
      await prisma.oAuthAccount.create({
        data: {
          ownerId: ids.owner,
          provider: OAuthProvider.GOOGLE,
          providerAccountId: 'google-sub-123',
          email: EMAIL,
        },
      });

      const ownerId = await auth.findOrLinkOrCreateFromOAuth(perfil({ email: null }));
      assert.strictEqual(ownerId, ids.owner, 'o vínculo já existe; o email nem entra na conta');
    },
  ],

  // --- Troca do code pela sessão ------------------------------------------
  [
    'o code é de uso único: a segunda troca é recusada',
    async () => {
      await semearDonoComSenha();
      const code = await auth.createExchangeCode(ids.owner);

      const sessao = await auth.consumeExchangeCode(code);
      assert.strictEqual(sessao.owner.id, ids.owner);

      await assert.rejects(() => auth.consumeExchangeCode(code), /inválida ou expirada/i);
    },
  ],
  [
    'duas trocas SIMULTÂNEAS do mesmo code viram uma sessão só',
    async () => {
      await semearDonoComSenha();
      const code = await auth.createExchangeCode(ids.owner);

      // A checagem de `usedAt` na leitura não resolve isto: as duas leem antes
      // de qualquer escrita e as duas veem `usedAt: null`. Quem decide é o
      // updateMany condicional — um code de sessão que valesse duas vezes é um
      // link de login reutilizável saindo pela URL do navegador.
      const r = await Promise.allSettled([
        auth.consumeExchangeCode(code),
        auth.consumeExchangeCode(code),
      ]);
      const passaram = r.filter((x) => x.status === 'fulfilled');
      assert.strictEqual(
        passaram.length,
        1,
        `só uma troca podia virar sessão, viraram ${passaram.length}`,
      );
    },
  ],
  [
    'o code cru não fica no banco — só o hash',
    async () => {
      await semearDonoComSenha();
      const code = await auth.createExchangeCode(ids.owner);

      const linha = await prisma.authExchange.findFirstOrThrow();
      assert.notStrictEqual(linha.codeHash, code, 'o code cru não pode ser gravado');
      assert.strictEqual(linha.codeHash, createHash('sha256').update(code).digest('hex'));
    },
  ],
  [
    'code expirado e code inventado são recusados',
    async () => {
      await semearDonoComSenha();
      await assert.rejects(() => auth.consumeExchangeCode('code-inventado'), /inválida/i);
      await assert.rejects(() => auth.consumeExchangeCode(''), /inválida/i);

      const code = await auth.createExchangeCode(ids.owner);
      await prisma.authExchange.updateMany({
        where: { codeHash: createHash('sha256').update(code).digest('hex') },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await assert.rejects(() => auth.consumeExchangeCode(code), /expirada/i);
    },
  ],
  [
    'o code devolve a sessão do dono certo — com o businessId dele, não o do vizinho',
    async () => {
      await semearDonoComSenha();
      const vizinhoId = await auth.findOrLinkOrCreateFromOAuth(
        perfil({ email: 'vizinho@teste.com', providerAccountId: 'sub-vizinho' }),
      );
      const vizinho = await prisma.owner.findUniqueOrThrow({ where: { id: vizinhoId } });

      const sessao = await auth.consumeExchangeCode(await auth.createExchangeCode(vizinhoId));

      assert.strictEqual(sessao.owner.id, vizinhoId);
      assert.strictEqual(sessao.business.id, vizinho.businessId);
      assert.notStrictEqual(
        sessao.business.id,
        ids.business,
        'a sessão não pode apontar para o negócio de outro dono',
      );
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
