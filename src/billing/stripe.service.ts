import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { isPlanId, type PlanId } from './plan-catalog';

// Nome da env de Price ID (Stripe) por plano. Os produtos no Stripe ficam com
// o PREÇO CHEIO (fullCents do catálogo) — o desconto de lançamento é o cupom
// automático de PLAN_COUPON_ENV, nunca um preço separado.
const PLAN_PRICE_ENV: Record<PlanId, string> = {
  START: 'STRIPE_PRICE_START',
  PRO: 'STRIPE_PRICE_PRO',
  ULTRA: 'STRIPE_PRICE_ULTRA',
};

// Cupom do desconto de lançamento (3 primeiros meses, ver LAUNCH_PRICING_MONTHS
// em plan-catalog.ts) aplicado AUTOMÁTICO no Checkout — não depende do cliente
// digitar nada. Start não tem entrada aqui: preço dele já é o cheio (sem
// transição), então não precisa de cupom.
const PLAN_COUPON_ENV: Partial<Record<PlanId, string>> = {
  PRO: 'STRIPE_COUPON_PRO',
  ULTRA: 'STRIPE_COUPON_ULTRA',
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new InternalServerErrorException(
      `Checkout indisponível: variável de ambiente ${name} não configurada.`,
    );
  }
  return value;
}

// Base pública do front (success/cancel url do Checkout). Mesmo fallback usado
// em src/auth/auth.controller.ts.
function webBase(): string {
  return process.env.WEB_ORIGIN ?? 'http://localhost:3001';
}

@Injectable()
export class StripeService {
  // Instanciado sob demanda: só exige STRIPE_SECRET_KEY quando o checkout é
  // de fato usado, não no boot da API (mesmo espírito de VAPID/SMTP no
  // .env.example — degrada com elegância em vez de derrubar o processo).
  private client: Stripe | null = null;

  constructor(private prisma: PrismaService) {}

  private stripe(): Stripe {
    if (!this.client) {
      this.client = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
        // Fixa a versão da API na que o SDK foi gerado — evita quebra
        // silenciosa se a conta mudar o padrão no futuro.
        apiVersion: '2026-06-24.dahlia',
      });
    }
    return this.client;
  }

  /** Garante um stripe.Customer pro negócio; cria no 1º checkout, reaproveita depois. */
  private async ensureCustomerId(
    businessId: string,
    ownerEmail: string,
  ): Promise<string> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { stripeCustomerId: true, name: true },
    });
    if (business.stripeCustomerId) return business.stripeCustomerId;

    const customer = await this.stripe().customers.create({
      email: ownerEmail,
      name: business.name,
      metadata: { businessId },
    });
    await this.prisma.business.update({
      where: { id: businessId },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  /**
   * Ponto de entrada do botão "Assinar". Se o negócio JÁ tem uma subscription
   * Stripe ativa, troca o plano NELA (proration) em vez de abrir um novo
   * Checkout — evita duas subscriptions cobrando em paralelo no mesmo
   * customer (bug real: assinar Pro com o Start ainda ativo deixava as duas
   * ligadas). Só abre Checkout novo pra quem ainda não tem assinatura viva
   * (1º checkout) ou já está CANCELED (nada pra trocar).
   *
   * PAST_DUE é assinatura VIVA (o Stripe ainda tenta cobrar a fatura em aberto):
   * abrir Checkout aqui criava a MESMA duplicata que o guard existe pra impedir,
   * e trocar o price seria um no-op que não quita a fatura. Então PAST_DUE (e
   * qualquer status vivo não-ACTIVE) vai pro Portal de Cobrança, onde o dono
   * atualiza o cartão e regulariza — depois disso o "Assinar"/trocar volta a
   * funcionar normalmente.
   */
  async subscribe(params: {
    businessId: string;
    planId: string;
    ownerEmail: string;
  }): Promise<{ url: string } | { switched: true }> {
    if (!isPlanId(params.planId)) {
      throw new BadRequestException('Plano inválido.');
    }
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: params.businessId },
      select: { stripeSubscriptionId: true, subscriptionStatus: true },
    });

    if (business.stripeSubscriptionId && business.subscriptionStatus !== 'CANCELED') {
      if (business.subscriptionStatus === 'ACTIVE') {
        await this.switchSubscriptionPlan({
          businessId: params.businessId,
          planId: params.planId,
          stripeSubscriptionId: business.stripeSubscriptionId,
        });
        return { switched: true };
      }
      // Assinatura viva mas não-ACTIVE (PAST_DUE): Portal em vez de Checkout novo,
      // pra não criar uma segunda subscription no mesmo customer.
      const url = await this.createPortalSessionUrl(params.businessId);
      return { url };
    }

    const url = await this.createCheckoutSessionUrl(params);
    return { url };
  }

  /** ID do cupom de lançamento do plano (undefined = plano sem transição, ex. Start). */
  private launchCouponId(planId: PlanId): string | undefined {
    const envName = PLAN_COUPON_ENV[planId];
    return envName ? requireEnv(envName) : undefined;
  }

  /**
   * Troca o price da subscription existente (mesmo `subscription_data.metadata`
   * de businessId+planId que o Checkout gravaria) — o webhook
   * `customer.subscription.updated` disparado por essa chamada é quem de fato
   * sincroniza o `plan` no banco (ver `BillingService.syncActiveFromStripe`).
   * Reaplica (ou remove, se o plano novo não tiver) o cupom de lançamento —
   * senão um upgrade herdaria o desconto do plano antigo, ou um downgrade pro
   * Start ficaria com o desconto de um cupom que não é mais dele.
   */
  private async switchSubscriptionPlan(params: {
    businessId: string;
    planId: PlanId;
    stripeSubscriptionId: string;
  }): Promise<void> {
    const priceId = requireEnv(PLAN_PRICE_ENV[params.planId]);
    const couponId = this.launchCouponId(params.planId);
    const sub = await this.stripe().subscriptions.retrieve(params.stripeSubscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) {
      throw new InternalServerErrorException('Assinatura sem item pra trocar de plano.');
    }
    await this.stripe().subscriptions.update(params.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: 'create_prorations',
      // A API do Stripe só limpa desconto com STRING VAZIA — um array vazio
      // (`[]`) é tratado como "nenhuma mudança" e mantém o cupom antigo preso
      // na subscription (confirmado testando: `discounts: []` não some com
      // nada, só `discounts: ''` remove de fato).
      discounts: couponId ? [{ coupon: couponId }] : '',
      metadata: { businessId: params.businessId, planId: params.planId },
    });
  }

  /**
   * Cria a Checkout Session de assinatura (mode: subscription) e devolve a URL
   * pra onde o front redireciona o dono. `subscription_data.metadata` carrega
   * businessId+planId pra todo evento futuro do webhook (renovação, falha,
   * cancelamento) saber de qual negócio se trata, sem depender de
   * client_reference_id (que some após o 1º checkout). O desconto de
   * lançamento (3 primeiros meses) entra automático via `discounts` quando o
   * plano tem cupom — Stripe não deixa combinar `discounts` com
   * `allow_promotion_codes`, então só liberamos código promocional manual
   * pros planos sem cupom automático (Start).
   */
  async createCheckoutSessionUrl(params: {
    businessId: string;
    planId: string;
    ownerEmail: string;
  }): Promise<string> {
    if (!isPlanId(params.planId)) {
      throw new BadRequestException('Plano inválido.');
    }
    const priceId = requireEnv(PLAN_PRICE_ENV[params.planId]);
    const couponId = this.launchCouponId(params.planId);
    const customerId = await this.ensureCustomerId(
      params.businessId,
      params.ownerEmail,
    );

    const base = webBase();
    const session = await this.stripe().checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      ...(couponId
        ? { discounts: [{ coupon: couponId }] }
        : { allow_promotion_codes: true }),
      client_reference_id: params.businessId,
      subscription_data: {
        metadata: { businessId: params.businessId, planId: params.planId },
      },
      success_url: `${base}/painel/planos?checkout=sucesso`,
      cancel_url: `${base}/painel/planos?checkout=cancelado`,
    });

    if (!session.url) {
      throw new InternalServerErrorException(
        'Stripe não devolveu a URL do Checkout.',
      );
    }
    return session.url;
  }

  /**
   * URL do Portal de Cobrança do Stripe: página hospedada onde o dono atualiza
   * o cartão, vê faturas e cancela a assinatura sozinho. Exige stripeCustomerId
   * (ou seja, já ter assinado alguma vez). O Portal precisa ser configurado uma
   * vez no Dashboard do Stripe (Configurações > Billing > Customer portal).
   */
  async createPortalSessionUrl(businessId: string): Promise<string> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { stripeCustomerId: true },
    });
    if (!business.stripeCustomerId) {
      throw new BadRequestException(
        'Você ainda não tem uma assinatura pra gerenciar.',
      );
    }
    const session = await this.stripe().billingPortal.sessions.create({
      customer: business.stripeCustomerId,
      return_url: `${webBase()}/painel/planos`,
    });
    return session.url;
  }

  /**
   * Verifica a assinatura do webhook e devolve o evento (ou lança 400 se a
   * assinatura for inválida/ausente). rawBody precisa vir intacto — ver
   * `rawBody: true` em main.ts.
   */
  constructEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    if (!signature) {
      throw new BadRequestException('Assinatura do webhook (stripe-signature) ausente.');
    }
    const secret = requireEnv('STRIPE_WEBHOOK_SECRET');
    try {
      return this.stripe().webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      throw new BadRequestException(
        `Assinatura do webhook inválida: ${(err as Error).message}`,
      );
    }
  }
}
