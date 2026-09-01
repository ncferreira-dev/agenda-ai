import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { AuthService } from './auth.service';
import { criarExtensaoAuditoria } from '../prisma/prisma-audit.extension';
import type { PrismaService } from '../prisma/prisma.service';
import type { MailService } from '../mail/mail.service';
import type { JwtService } from '@nestjs/jwt';

// ---------------------------------------------------------------------------
// CADASTRO DO DONO — integração, contra Postgres.
//
// É a única escrita do sistema que cria um TENANT: um register bem-sucedido
// gera Business + Owner de uma vez. Dois riscos moram aqui e nenhum aparece
// lendo o código:
//
//  1. Negócio órfão. O Business é criado ANTES do Owner. Se o Owner falhar
//     (email repetido) e a transação não voltar atrás, fica um negócio sem
//     dono no banco — invisível pro painel e eterno.
//  2. Slug que sequestra rota. O slug vira URL pública. Um negócio chamado
//     "Painel" que virasse /painel comeria a rota do app inteiro.
//
// Os dois só se provam contando linhas no banco depois do erro.
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

async function limpar() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AuditLog","PasswordReset","OAuthAccount","AuthExchange","Owner","Business" CASCADE',
  );
}

/** Entrada mínima válida; cada teste sobrescreve só o que está medindo. */
function entrada(over: Partial<Parameters<AuthService['register']>[0]> = {}) {
  return {
    name: 'Maria Silva',
    email: 'maria@teste.com',
    password: 'senhaForte1',
    businessName: 'Studio da Maria',
    ...over,
  };
}

const contar = async () => ({
  negocios: await prisma.business.count(),
  donos: await prisma.owner.count(),
});

const tests: Array<[string, () => Promise<void>]> = [
  [
    'cadastro cria negócio em trial de 14 dias e devolve a sessão do dono',
    async () => {
      await limpar();
      const antes = Date.now();
      const sessao = await auth.register(entrada());

      assert.strictEqual(sessao.owner.email, 'maria@teste.com');
      assert.ok(sessao.access_token, 'a sessão precisa vir com token');
      assert.strictEqual(sessao.business.slug, 'studio-da-maria');

      const negocio = await prisma.business.findUniqueOrThrow({
        where: { id: sessao.business.id },
      });
      assert.strictEqual(negocio.subscriptionStatus, 'TRIALING');
      assert.ok(negocio.trialEndsAt, 'trial precisa ter data de fim');
      const dias = (negocio.trialEndsAt.getTime() - antes) / 86_400_000;
      assert.ok(dias > 13.9 && dias < 14.1, `trial deveria ser de 14 dias, veio ${dias}`);
      assert.strictEqual(negocio.onboardedAt, null, 'onboarding nasce pendente');
    },
  ],
  [
    'a senha vai pro banco como hash, nunca em claro — e o login com ela funciona',
    async () => {
      await limpar();
      await auth.register(entrada());

      const dono = await prisma.owner.findUniqueOrThrow({ where: { email: 'maria@teste.com' } });
      assert.ok(dono.passwordHash, 'precisa gravar hash');
      assert.ok(
        !dono.passwordHash.includes('senhaForte1'),
        'a senha em claro não pode aparecer no banco',
      );
      assert.ok(dono.passwordHash.startsWith('$argon2'), 'esperava hash argon2');

      const logado = await auth.validateOwner('maria@teste.com', 'senhaForte1');
      assert.strictEqual(logado.id, dono.id);
    },
  ],
  [
    'email repetido é recusado com a mensagem que manda a pessoa fazer login',
    async () => {
      await limpar();
      await auth.register(entrada());
      await assert.rejects(
        () => auth.register(entrada({ businessName: 'Outro Studio' })),
        /já tem conta/i,
      );
      assert.deepStrictEqual(await contar(), { negocios: 1, donos: 1 });
    },
  ],
  [
    'dois cadastros simultâneos do mesmo email: um entra e o outro não deixa negócio órfão',
    async () => {
      await limpar();
      // Corrida DE VERDADE, e é ela que vale: as duas checagens amigáveis
      // rodam antes de qualquer insert (o hash de senha demora), então quem
      // barra é o @unique do banco. E como o Business é criado ANTES do Owner,
      // é o rollback da transação que decide se sobra um negócio sem dono.
      // Sem a transação, este teste termina com 2 negócios e 1 dono.
      const r = await Promise.allSettled([
        auth.register(entrada({ businessName: 'Studio A' })),
        auth.register(entrada({ businessName: 'Studio B' })),
      ]);
      const passaram = r.filter((x) => x.status === 'fulfilled');
      assert.strictEqual(
        passaram.length,
        1,
        `exatamente um cadastro deveria passar, passaram ${passaram.length}`,
      );
      assert.deepStrictEqual(
        await contar(),
        { negocios: 1, donos: 1 },
        'o cadastro perdedor não pode ter deixado um negócio sem dono',
      );
    },
  ],
  [
    'email é normalizado: "  MARIA@Teste.com " é a mesma conta que "maria@teste.com"',
    async () => {
      await limpar();
      await auth.register(entrada());

      await assert.rejects(
        () => auth.register(entrada({ email: '  MARIA@Teste.com ' })),
        /já tem conta/i,
        'maiúsculas e espaços não podem criar uma segunda conta do mesmo email',
      );

      // E o email gravado é o normalizado (senão o login por minúscula não acha).
      const dono = await prisma.owner.findUniqueOrThrow({ where: { email: 'maria@teste.com' } });
      assert.strictEqual(dono.email, 'maria@teste.com');
    },
  ],
  [
    'senha curta e email inválido são recusados sem criar nada',
    async () => {
      await limpar();
      await assert.rejects(() => auth.register(entrada({ password: '1234567' })), /8 caracteres/i);
      await assert.rejects(() => auth.register(entrada({ email: 'sem-arroba' })), /Email inválido/i);
      await assert.rejects(() => auth.register(entrada({ name: '   ' })), /Informe seu nome/i);
      await assert.rejects(
        () => auth.register(entrada({ businessName: '  ' })),
        /nome do negócio/i,
      );

      assert.deepStrictEqual(await contar(), { negocios: 0, donos: 0 });
    },
  ],
  [
    'tipo de atendimento manda no que é guardado: remoto sem endereço, presencial sem link',
    async () => {
      await limpar();
      const remoto = await auth.register(
        entrada({
          email: 'r@teste.com',
          businessName: 'Consultoria Remota',
          serviceMode: 'REMOTO',
          address: 'Rua das Flores, 10',
          meetingUrl: 'meet.google.com/abc',
        }),
      );
      const n1 = await prisma.business.findUniqueOrThrow({ where: { id: remoto.business.id } });
      assert.strictEqual(n1.serviceMode, 'REMOTO');
      assert.strictEqual(n1.address, null, 'remoto não guarda endereço');
      assert.strictEqual(n1.meetingUrl, 'https://meet.google.com/abc', 'link sem esquema ganha https');

      const presencial = await auth.register(
        entrada({
          email: 'p@teste.com',
          businessName: 'Barbearia do Bairro',
          serviceMode: 'PRESENCIAL',
          address: 'Rua das Flores, 10',
          meetingUrl: 'meet.google.com/abc',
        }),
      );
      const n2 = await prisma.business.findUniqueOrThrow({ where: { id: presencial.business.id } });
      assert.strictEqual(n2.meetingUrl, null, 'presencial não guarda link de atendimento');
      assert.strictEqual(n2.address, 'Rua das Flores, 10');

      const hibrido = await auth.register(
        entrada({
          email: 'h@teste.com',
          businessName: 'Clinica Mista',
          serviceMode: 'HIBRIDO',
          address: 'Av. Central, 99',
          meetingUrl: 'https://zoom.us/j/1',
        }),
      );
      const n3 = await prisma.business.findUniqueOrThrow({ where: { id: hibrido.business.id } });
      assert.strictEqual(n3.address, 'Av. Central, 99');
      assert.strictEqual(n3.meetingUrl, 'https://zoom.us/j/1', 'híbrido guarda os dois');
    },
  ],
  [
    'tipo de atendimento desconhecido cai em presencial em vez de estourar',
    async () => {
      await limpar();
      const s = await auth.register(entrada({ serviceMode: 'TELEPATIA' }));
      const n = await prisma.business.findUniqueOrThrow({ where: { id: s.business.id } });
      assert.strictEqual(n.serviceMode, 'PRESENCIAL');
    },
  ],
  [
    'dois negócios com o mesmo nome ganham slugs diferentes (o segundo não estoura)',
    async () => {
      await limpar();
      const a = await auth.register(entrada());
      const b = await auth.register(entrada({ email: 'outra@teste.com' }));

      assert.strictEqual(a.business.slug, 'studio-da-maria');
      assert.strictEqual(b.business.slug, 'studio-da-maria-2');
    },
  ],
  [
    'nome de negócio que viraria rota do app não sequestra a rota',
    async () => {
      await limpar();
      const s = await auth.register(entrada({ businessName: 'Painel' }));
      assert.notStrictEqual(s.business.slug, 'painel', 'slug reservado não pode ser usado');
      assert.strictEqual(s.business.slug, 'painel-2');
    },
  ],
  [
    'nome só com símbolos ainda gera um slug válido (a página pública precisa existir)',
    async () => {
      await limpar();
      const s = await auth.register(entrada({ businessName: '### !!! ###' }));
      assert.ok(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.business.slug),
        `slug fora do formato: ${s.business.slug}`,
      );
      assert.ok(s.business.slug.length >= 3, 'slug curto demais para a URL');
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
