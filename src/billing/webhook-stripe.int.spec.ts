import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import Stripe from 'stripe';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { StripeWebhookController } from './stripe-webhook.controller';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { criarExtensaoAuditoria } from '../prisma/prisma-audit.extension';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';

// ---------------------------------------------------------------------------
// WEBHOOK DO STRIPE — integração, contra Postgres, com assinatura DE VERDADE.
//
// Este é o único lugar do sistema onde um estranho na internet escreve no
// estado que decide se o negócio está pago. Duas coisas o seguram:
//
//  1. A ASSINATURA. Sem ela, um POST com JSON inventado ativa qualquer plano
//     de graça. Por isso aqui não há stub de constructEvent: a assinatura é
//     gerada pelo próprio SDK do Stripe e conferida pelo código de produção.
//  2. O "ainda é a subscription oficial?". Depois de uma troca de plano, a
//     subscription antiga continua existindo no Stripe e ainda manda eventos.
//     Se um past_due DELA derrubar o negócio, o dono que está pagando em dia
//     perde o acesso — e a causa fica invisível.
//
// O resto (dedupe, renovação que não reseta o preço de lançamento) é dinheiro
// também: reprocessar um evento ou zerar subscribedAt renova o desconto de
// lançamento pra sempre.
// ---------------------------------------------------------------------------

const URL_DE_TESTE = execSync('node scripts/banco-de-teste.mjs --url', { encoding: 'utf8' }).trim();
if (!/_teste(\?|$)/.test(URL_DE_TESTE)) {
  console.error(`Recusando rodar: a URL precisa terminar em _teste (veio ${URL_DE_TESTE})`);
  process.exit(1);
}

const SEGREDO = 'whsec_segredo_de_teste';
process.env.STRIPE_WEBHOOK_SECRET = SEGREDO;
process.env.STRIPE_SECRET_KEY = 'sk_test_de_mentira';

const base = new PrismaClient({ datasources: { db: { url: URL_DE_TESTE } } });
const prisma = base.$extends(criarExtensaoAuditoria(base)) as unknown as PrismaService;

const avisosDeFalha: string[] = [];
const notifications = {
  notifyPaymentFailed: async (businessId: string) => {
    avisosDeFalha.push(businessId);
  },
} as unknown as NotificationsService;

const stripeService = new StripeService(prisma);
const billing = new BillingService(prisma);
const controller = new StripeWebhookController(prisma, billing, stripeService, notifications);

// SDK só pra assinar o payload — mesma conta de mentira, nenhuma chamada de rede.
const assinador = new Stripe('sk_test_de_mentira');

const NEGOCIO = '00000000-0000-4000-9000-000000000001';
const SUB_OFICIAL = 'sub_oficial';
const CLIENTE = 'cus_123';

async function limpar() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AuditLog","ProcessedStripeEvent","Owner","Business" CASCADE',
  );
  avisosDeFalha.length = 0;
}

async function semear(over: Record<string, unknown> = {}) {
  await limpar();
  await prisma.business.create({
    data: {
      id: NEGOCIO,
      name: 'Negócio',
      slug: 'negocio-teste',
      timezone: 'America/Sao_Paulo',
      subscriptionStatus: 'TRIALING',
      ...over,
    },
  });
}

const negocio = () => prisma.business.findUniqueOrThrow({ where: { id: NEGOCIO } });

const FIM_DO_PERIODO = Math.floor(new Date('2026-10-01T12:00:00Z').getTime() / 1000);

/** Evento de subscription no formato que o controller lê. */
function eventoDeAssinatura(over: {
  id?: string;
  type?: string;
  subId?: string;
  status?: string;
  planId?: string | null;
  businessId?: string | null;
  periodEnd?: number | null;
}) {
  const metadata: Record<string, string> = {};
  if (over.businessId !== null) metadata.businessId = over.businessId ?? NEGOCIO;
  if (over.planId !== null) metadata.planId = over.planId ?? 'PRO';

  return {
    id: over.id ?? 'evt_1',
    object: 'event',
    type: over.type ?? 'customer.subscription.updated',
    created: 1_760_000_000,
    livemode: false,
    data: {
      object: {
        id: over.subId ?? SUB_OFICIAL,
        object: 'subscription',
        status: over.status ?? 'active',
        customer: CLIENTE,
        metadata,
        items: {
          data:
            over.periodEnd === null
              ? []
              : [{ id: 'si_1', current_period_end: over.periodEnd ?? FIM_DO_PERIODO }],
        },
      },
    },
  };
}

/** Entrega o evento como o Stripe entregaria: corpo cru + header assinado. */
function entregar(evento: unknown, opcoes: { assinatura?: string | undefined } = {}) {
  const payload = JSON.stringify(evento);
  const assinatura =
    'assinatura' in opcoes
      ? opcoes.assinatura
      : assinador.webhooks.generateTestHeaderString({ payload, secret: SEGREDO });
  const req = { rawBody: Buffer.from(payload) } as unknown as RawBodyRequest<Request>;
  return controller.receive(req, assinatura);
}

const tests: Array<[string, () => Promise<void>]> = [
  [
    'evento com assinatura INVÁLIDA é recusado e não toca no negócio',
    async () => {
      await semear();
      await assert.rejects(
        () => entregar(eventoDeAssinatura({}), { assinatura: 't=1,v1=deadbeef' }),
        /Assinatura do webhook inválida/i,
      );
      assert.strictEqual((await negocio()).subscriptionStatus, 'TRIALING');
    },
  ],
  [
    'evento SEM assinatura é recusado (não existe webhook anônimo)',
    async () => {
      await semear();
      await assert.rejects(
        () => entregar(eventoDeAssinatura({}), { assinatura: undefined }),
        /ausente/i,
      );
      assert.strictEqual((await negocio()).subscriptionStatus, 'TRIALING');
    },
  ],
  [
    'corpo trocado depois de assinado é recusado (a assinatura é do corpo, não do envio)',
    async () => {
      await semear();
      const original = JSON.stringify(eventoDeAssinatura({}));
      const assinatura = assinador.webhooks.generateTestHeaderString({
        payload: original,
        secret: SEGREDO,
      });
      // Mesma assinatura, corpo adulterado pra ativar o plano mais caro.
      const adulterado = original.replace('"PRO"', '"ULTRA"');
      const req = { rawBody: Buffer.from(adulterado) } as unknown as RawBodyRequest<Request>;

      await assert.rejects(() => controller.receive(req, assinatura), /inválida/i);
      assert.strictEqual((await negocio()).plan, null);
    },
  ],
  [
    'subscription ativa liga o plano, grava as datas e os IDs do Stripe',
    async () => {
      await semear();
      const r = await entregar(eventoDeAssinatura({}));
      assert.deepStrictEqual(r, { received: true });

      const n = await negocio();
      assert.strictEqual(n.subscriptionStatus, 'ACTIVE');
      assert.strictEqual(n.plan, 'PRO');
      assert.strictEqual(n.stripeSubscriptionId, SUB_OFICIAL);
      assert.strictEqual(n.stripeCustomerId, CLIENTE);
      assert.strictEqual(n.currentPeriodEndsAt?.getTime(), FIM_DO_PERIODO * 1000);
      assert.ok(n.subscribedAt, 'a 1ª ativação precisa gravar subscribedAt');
      assert.ok(n.launchPricingEndsAt, 'preço de lançamento precisa ter data de fim');
    },
  ],
  [
    'renovação NÃO reseta subscribedAt nem o fim do preço de lançamento',
    async () => {
      await semear();
      await entregar(eventoDeAssinatura({ id: 'evt_ativa' }));
      const depoisDaPrimeira = await negocio();

      // Um mês depois, o Stripe manda outra active (renovação).
      const novoPeriodo = FIM_DO_PERIODO + 30 * 86_400;
      await entregar(eventoDeAssinatura({ id: 'evt_renova', periodEnd: novoPeriodo }));

      const agora = await negocio();
      assert.strictEqual(
        agora.subscribedAt?.getTime(),
        depoisDaPrimeira.subscribedAt?.getTime(),
        'renovar não pode virar uma nova 1ª assinatura',
      );
      assert.strictEqual(
        agora.launchPricingEndsAt?.getTime(),
        depoisDaPrimeira.launchPricingEndsAt?.getTime(),
        'renovar não pode empurrar o fim do desconto de lançamento pra frente',
      );
      assert.strictEqual(agora.currentPeriodEndsAt?.getTime(), novoPeriodo * 1000);
    },
  ],
  [
    'troca de plano na mesma subscription grava o plano NOVO',
    async () => {
      await semear();
      await entregar(eventoDeAssinatura({ id: 'evt_pro', planId: 'PRO' }));
      await entregar(eventoDeAssinatura({ id: 'evt_ultra', planId: 'ULTRA' }));

      const n = await negocio();
      assert.strictEqual(n.plan, 'ULTRA', 'o painel não pode mostrar o plano antigo');
      assert.strictEqual(n.subscriptionStatus, 'ACTIVE');
    },
  ],
  [
    'past_due da subscription oficial derruba o negócio pra PAST_DUE',
    async () => {
      await semear();
      await entregar(eventoDeAssinatura({ id: 'evt_ativa' }));
      await entregar(eventoDeAssinatura({ id: 'evt_atraso', status: 'past_due' }));
      assert.strictEqual((await negocio()).subscriptionStatus, 'PAST_DUE');
    },
  ],
  [
    'past_due de uma subscription ANTIGA não derruba quem está pagando em dia',
    async () => {
      await semear();
      await entregar(eventoDeAssinatura({ id: 'evt_ativa' }));

      // A antiga (trocada de plano e cancelada no Stripe) ainda manda evento.
      await entregar(
        eventoDeAssinatura({ id: 'evt_velha', subId: 'sub_antiga', status: 'past_due' }),
      );

      const n = await negocio();
      assert.strictEqual(
        n.subscriptionStatus,
        'ACTIVE',
        'evento de subscription que não é mais a oficial não pode mexer no estado',
      );
      assert.strictEqual(n.stripeSubscriptionId, SUB_OFICIAL);
    },
  ],
  [
    'cancelamento: a oficial cancela, a antiga é ignorada',
    async () => {
      await semear();
      await entregar(eventoDeAssinatura({ id: 'evt_ativa' }));

      await entregar(
        eventoDeAssinatura({
          id: 'evt_del_velha',
          type: 'customer.subscription.deleted',
          subId: 'sub_antiga',
        }),
      );
      assert.strictEqual((await negocio()).subscriptionStatus, 'ACTIVE');

      await entregar(
        eventoDeAssinatura({ id: 'evt_del', type: 'customer.subscription.deleted' }),
      );
      assert.strictEqual((await negocio()).subscriptionStatus, 'CANCELED');
    },
  ],
  [
    'o mesmo evento entregue duas vezes é processado uma vez só',
    async () => {
      await semear();
      await entregar(eventoDeAssinatura({ id: 'evt_ativa' }));
      await entregar(eventoDeAssinatura({ id: 'evt_cancela', status: 'canceled' }));
      assert.strictEqual((await negocio()).subscriptionStatus, 'CANCELED');

      // O Stripe reenvia o evento de ativação (retry). Se não houver dedupe,
      // ele reativa um negócio que já foi cancelado.
      await entregar(eventoDeAssinatura({ id: 'evt_ativa' }));
      assert.strictEqual(
        (await negocio()).subscriptionStatus,
        'CANCELED',
        'reentrega de evento antigo não pode ressuscitar a assinatura',
      );

      assert.strictEqual(await prisma.processedStripeEvent.count(), 2);
    },
  ],
  [
    'evento sem businessId no metadata é ignorado sem estourar',
    async () => {
      await semear();
      const r = await entregar(eventoDeAssinatura({ businessId: null }));
      assert.deepStrictEqual(r, { received: true });
      assert.strictEqual((await negocio()).subscriptionStatus, 'TRIALING');
    },
  ],
  [
    'subscription ativa sem planId não ativa plano nenhum',
    async () => {
      await semear();
      await entregar(eventoDeAssinatura({ planId: null }));
      const n = await negocio();
      assert.strictEqual(n.plan, null);
      assert.strictEqual(n.subscriptionStatus, 'TRIALING');
    },
  ],
  [
    'subscription sem itens não ativa nada (não dá pra saber a renovação)',
    async () => {
      await semear();
      await entregar(eventoDeAssinatura({ periodEnd: null }));
      assert.strictEqual((await negocio()).subscriptionStatus, 'TRIALING');
    },
  ],
  [
    'falha de pagamento avisa o dono do negócio certo',
    async () => {
      await semear({ stripeSubscriptionId: SUB_OFICIAL });
      await entregar({
        id: 'evt_falha',
        object: 'event',
        type: 'invoice.payment_failed',
        created: 1_760_000_000,
        livemode: false,
        data: {
          object: {
            id: 'in_1',
            object: 'invoice',
            parent: { subscription_details: { subscription: SUB_OFICIAL } },
          },
        },
      });
      assert.deepStrictEqual(avisosDeFalha, [NEGOCIO]);
    },
  ],
  [
    'falha de pagamento de uma assinatura que não é nossa não avisa ninguém',
    async () => {
      await semear({ stripeSubscriptionId: SUB_OFICIAL });
      await entregar({
        id: 'evt_falha_alheia',
        object: 'event',
        type: 'invoice.payment_failed',
        created: 1_760_000_000,
        livemode: false,
        data: {
          object: {
            id: 'in_2',
            object: 'invoice',
            parent: { subscription_details: { subscription: 'sub_de_outra_conta' } },
          },
        },
      });
      assert.deepStrictEqual(avisosDeFalha, []);
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
