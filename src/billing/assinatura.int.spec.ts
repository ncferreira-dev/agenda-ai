import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import type Stripe from 'stripe';
import { StripeService } from './stripe.service';
import { criarExtensaoAuditoria } from '../prisma/prisma-audit.extension';
import type { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// BOTÃO "ASSINAR" — qual caminho o StripeService escolhe.
//
// `subscribe` decide entre TRÊS coisas muito diferentes, a partir de dois
// campos do banco (stripeSubscriptionId + subscriptionStatus):
//
//   Checkout novo  · trocar o plano na assinatura que já existe · Portal
//
// Errar essa escolha não dá erro em lugar nenhum — dá DUAS assinaturas
// cobrando no mesmo cartão. Foi bug real: assinar Pro com o Start ainda ativo
// deixava as duas ligadas. E PAST_DUE tem armadilha própria: é assinatura VIVA
// (o Stripe ainda tenta cobrar), então abrir Checkout ali cria a mesma
// duplicata, e trocar o price seria um no-op que não quita a fatura em aberto.
//
// O webhook (webhook-stripe.int.spec.ts) cobre o EFEITO dessas chamadas no
// banco. O que falta é a DECISÃO, e é só ela que este arquivo mede — por isso
// o cliente do Stripe aqui é um dublê que grava o que foi pedido.
// ---------------------------------------------------------------------------

const URL_DE_TESTE = execSync('node scripts/banco-de-teste.mjs --url', { encoding: 'utf8' }).trim();
if (!/_teste(\?|$)/.test(URL_DE_TESTE)) {
  console.error(`Recusando rodar: a URL precisa terminar em _teste (veio ${URL_DE_TESTE})`);
  process.exit(1);
}

process.env.STRIPE_PRICE_START = 'price_start';
process.env.STRIPE_PRICE_PRO = 'price_pro';
process.env.STRIPE_PRICE_ULTRA = 'price_ultra';
process.env.STRIPE_COUPON_PRO = 'cupom_pro';
process.env.STRIPE_COUPON_ULTRA = 'cupom_ultra';

const base = new PrismaClient({ datasources: { db: { url: URL_DE_TESTE } } });
const prisma = base.$extends(criarExtensaoAuditoria(base)) as unknown as PrismaService;

const NEGOCIO = '00000000-0000-4000-5000-000000000001';
const EMAIL = 'dono@teste.com';

/** O que o dublê recebeu, na ordem. É contra isto que os testes asseguram. */
interface Chamada {
  metodo: string;
  args: Record<string, unknown>;
}

let chamadas: Chamada[] = [];
const registrar = (metodo: string, args: unknown) => {
  chamadas.push({ metodo, args: (args ?? {}) as Record<string, unknown> });
};
/** Os argumentos com que o método foi chamado (undefined = não foi chamado). */
const argsDe = (metodo: string) => chamadas.find((c) => c.metodo === metodo)?.args;
const foiChamado = (metodo: string) => chamadas.some((c) => c.metodo === metodo);
const metodos = () => chamadas.map((c) => c.metodo);

/** Dublê do cliente Stripe: nenhuma rede, só memória do que foi pedido. */
function dubleDoStripe(): Stripe {
  return {
    customers: {
      create: async (args: unknown) => {
        registrar('customers.create', args);
        return { id: 'cus_novo' };
      },
    },
    checkout: {
      sessions: {
        create: async (args: unknown) => {
          registrar('checkout.sessions.create', args);
          return { url: 'https://checkout.stripe/sessao' };
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (args: unknown) => {
          registrar('billingPortal.sessions.create', args);
          return { url: 'https://portal.stripe/sessao' };
        },
      },
    },
    subscriptions: {
      retrieve: async (id: string) => {
        registrar('subscriptions.retrieve', { id });
        return { id, items: { data: [{ id: 'si_1' }] } };
      },
      update: async (id: string, args: unknown) => {
        registrar('subscriptions.update', { id, ...(args as object) });
        return { id };
      },
    },
  } as unknown as Stripe;
}

/** O cliente é criado sob demanda dentro do service; plantamos o dublê no lugar. */
function servico(): StripeService {
  const s = new StripeService(prisma);
  (s as unknown as { client: Stripe }).client = dubleDoStripe();
  return s;
}

async function limpar() {
  await prisma.$executeRawUnsafe('TRUNCATE "AuditLog","Owner","Business" CASCADE');
  chamadas = [];
}

async function semear(over: Record<string, unknown> = {}) {
  await limpar();
  await prisma.business.create({
    data: { id: NEGOCIO, name: 'Negócio', slug: 'negocio-teste', ...over },
  });
}

const negocio = () => prisma.business.findUniqueOrThrow({ where: { id: NEGOCIO } });
const assinar = (planId: string) =>
  servico().subscribe({ businessId: NEGOCIO, planId, ownerEmail: EMAIL });

const tests: Array<[string, () => Promise<void>]> = [
  [
    'quem nunca assinou vai pro Checkout (e ganha um customer no Stripe)',
    async () => {
      await semear({ subscriptionStatus: 'TRIALING' });

      const r = await assinar('PRO');
      assert.deepStrictEqual(r, { url: 'https://checkout.stripe/sessao' });
      assert.ok(foiChamado('customers.create'), 'o 1º checkout precisa criar o customer');
      assert.ok(foiChamado('checkout.sessions.create'));
      assert.strictEqual((await negocio()).stripeCustomerId, 'cus_novo');
    },
  ],
  [
    'ASSINATURA ATIVA troca o plano NELA — não abre um segundo Checkout',
    async () => {
      await semear({
        subscriptionStatus: 'ACTIVE',
        plan: 'START',
        stripeCustomerId: 'cus_ja_existe',
        stripeSubscriptionId: 'sub_viva',
      });

      const r = await assinar('PRO');

      assert.deepStrictEqual(r, { switched: true });
      assert.ok(
        !foiChamado('checkout.sessions.create'),
        'abrir Checkout aqui deixa DUAS assinaturas cobrando o mesmo cartão',
      );
      const update = argsDe('subscriptions.update');
      assert.ok(update, 'precisa trocar o price na assinatura que já existe');
      assert.strictEqual(update.id, 'sub_viva');
      assert.deepStrictEqual(update.items, [{ id: 'si_1', price: 'price_pro' }]);
      assert.strictEqual(update.proration_behavior, 'create_prorations');
    },
  ],
  [
    'PAST_DUE vai pro Portal: nem Checkout novo, nem troca de price',
    async () => {
      await semear({
        subscriptionStatus: 'PAST_DUE',
        plan: 'PRO',
        stripeCustomerId: 'cus_ja_existe',
        stripeSubscriptionId: 'sub_viva',
      });

      const r = await assinar('ULTRA');

      assert.deepStrictEqual(r, { url: 'https://portal.stripe/sessao' });
      // Assinatura em atraso é assinatura VIVA. Checkout duplicaria; trocar o
      // price não quita a fatura em aberto. O Portal é onde o cartão se troca.
      assert.deepStrictEqual(metodos(), ['billingPortal.sessions.create']);
    },
  ],
  [
    'CANCELED volta pro Checkout (não há assinatura viva pra trocar)',
    async () => {
      await semear({
        subscriptionStatus: 'CANCELED',
        plan: 'PRO',
        stripeCustomerId: 'cus_ja_existe',
        stripeSubscriptionId: 'sub_morta',
      });

      const r = await assinar('PRO');

      assert.deepStrictEqual(r, { url: 'https://checkout.stripe/sessao' });
      assert.ok(!foiChamado('subscriptions.update'), 'não dá pra trocar plano de assinatura morta');
    },
  ],
  [
    'o customer do Stripe é reaproveitado, nunca criado duas vezes',
    async () => {
      await semear({ subscriptionStatus: 'CANCELED', stripeCustomerId: 'cus_ja_existe' });

      await assinar('PRO');

      assert.ok(!foiChamado('customers.create'), 'criar outro customer perde o histórico de faturas');
      const checkout = argsDe('checkout.sessions.create');
      assert.strictEqual(checkout?.customer, 'cus_ja_existe');
    },
  ],
  [
    'plano inválido é recusado ANTES de qualquer chamada ao Stripe',
    async () => {
      await semear({ subscriptionStatus: 'TRIALING' });
      await assert.rejects(() => assinar('DIAMANTE'), /Plano inválido/i);
      assert.deepStrictEqual(chamadas, [], 'nada podia ter ido pro Stripe');
    },
  ],
  [
    'o Checkout carrega businessId e planId no metadata da assinatura',
    async () => {
      await semear({ subscriptionStatus: 'TRIALING' });
      await assinar('ULTRA');

      // Todo evento futuro do webhook (renovação, falha, cancelamento) descobre
      // de qual negócio se trata por aqui — client_reference_id some depois do
      // 1º checkout.
      const checkout = argsDe('checkout.sessions.create');
      const subData = checkout?.subscription_data as { metadata: Record<string, string> };
      assert.deepStrictEqual(subData.metadata, { businessId: NEGOCIO, planId: 'ULTRA' });
      assert.strictEqual(checkout?.mode, 'subscription');
    },
  ],
  [
    'plano com desconto de lançamento leva o cupom automático; Start não',
    async () => {
      await semear({ subscriptionStatus: 'TRIALING' });
      await assinar('PRO');
      const comCupom = argsDe('checkout.sessions.create');
      assert.deepStrictEqual(comCupom?.discounts, [{ coupon: 'cupom_pro' }]);
      // O Stripe não deixa combinar discounts com allow_promotion_codes.
      assert.strictEqual(comCupom?.allow_promotion_codes, undefined);

      await semear({ subscriptionStatus: 'TRIALING' });
      await assinar('START');
      const semCupom = argsDe('checkout.sessions.create');
      assert.strictEqual(semCupom?.discounts, undefined, 'Start já é preço cheio');
      assert.strictEqual(semCupom?.allow_promotion_codes, true);
    },
  ],
  [
    'na troca de plano o cupom é TROCADO junto — upgrade não herda o desconto antigo',
    async () => {
      await semear({
        subscriptionStatus: 'ACTIVE',
        plan: 'PRO',
        stripeCustomerId: 'cus_x',
        stripeSubscriptionId: 'sub_viva',
      });

      await assinar('ULTRA');

      const update = argsDe('subscriptions.update');
      assert.deepStrictEqual(update?.discounts, [{ coupon: 'cupom_ultra' }]);
      assert.deepStrictEqual(update?.metadata, { businessId: NEGOCIO, planId: 'ULTRA' });
    },
  ],
  [
    'descer pro Start REMOVE o cupom com string vazia (array vazio não remove nada)',
    async () => {
      await semear({
        subscriptionStatus: 'ACTIVE',
        plan: 'ULTRA',
        stripeCustomerId: 'cus_x',
        stripeSubscriptionId: 'sub_viva',
      });

      await assinar('START');

      const update = argsDe('subscriptions.update');
      // A API do Stripe só limpa desconto com string vazia: `discounts: []` é
      // lido como "nenhuma mudança" e deixa o cupom antigo preso na assinatura
      // — o negócio pagaria Start com desconto de Ultra, para sempre.
      assert.strictEqual(update?.discounts, '', `esperava string vazia, veio ${JSON.stringify(update?.discounts)}`);
    },
  ],
  [
    'Portal exige ter assinado alguma vez, e diz isso',
    async () => {
      await semear({ subscriptionStatus: 'TRIALING' });
      await assert.rejects(
        () => servico().createPortalSessionUrl(NEGOCIO),
        /ainda não tem uma assinatura/i,
      );
      assert.deepStrictEqual(chamadas, []);
    },
  ],
  [
    'Price ID não configurado falha com o nome da variável, não com erro do Stripe',
    async () => {
      await semear({ subscriptionStatus: 'TRIALING' });
      const antes = process.env.STRIPE_PRICE_PRO;
      delete process.env.STRIPE_PRICE_PRO;
      try {
        await assert.rejects(() => assinar('PRO'), /STRIPE_PRICE_PRO/);
      } finally {
        process.env.STRIPE_PRICE_PRO = antes;
      }
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
