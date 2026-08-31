import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  getPlan,
  isPlanId,
  type PlanBenefit,
  type PlanId,
} from './plan-catalog';
import {
  launchPricingEndsAt,
  nextRenewalAt,
  quote,
  type Quote,
} from './pricing';

export interface MyPlanView {
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  planId: PlanId | null;
  planName: string | null;
  tagline: string | null;
  who: string | null;
  benefits: PlanBenefit[];
  subscribedAt: string | null;
  currentPeriodEndsAt: string | null; // data de renovação
  currentPriceCents: number | null; // o que paga hoje
  // Quando/para quanto o preço muda (null = sem mudança agendada).
  priceChange: { at: string; toCents: number } | null;
  trialEndsAt: string | null;
}

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  /** Dados da aba "Meu plano". Só leitura. */
  async getMyPlan(businessId: string): Promise<MyPlanView> {
    const b = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        plan: true,
        subscriptionStatus: true,
        subscribedAt: true,
        currentPeriodEndsAt: true,
        launchPricingEndsAt: true,
        trialEndsAt: true,
      },
    });

    const base = {
      status: b.subscriptionStatus,
      trialEndsAt: b.trialEndsAt?.toISOString() ?? null,
    };

    // Ainda não assinou (ou sem plano definido): a tela mostra o estado de trial.
    if (!b.plan) {
      return {
        ...base,
        planId: null,
        planName: null,
        tagline: null,
        who: null,
        benefits: [],
        subscribedAt: null,
        currentPeriodEndsAt: null,
        currentPriceCents: null,
        priceChange: null,
      };
    }

    const plan = getPlan(b.plan);
    const now = new Date();
    // Ainda no preço de lançamento? (sem data de fim = promo permanente).
    const inLaunch = !b.launchPricingEndsAt || b.launchPricingEndsAt > now;
    const currentPriceCents = inLaunch ? plan.promoCents : plan.fullCents;
    const priceChange =
      b.launchPricingEndsAt && b.launchPricingEndsAt > now
        ? { at: b.launchPricingEndsAt.toISOString(), toCents: plan.fullCents }
        : null;

    return {
      ...base,
      planId: plan.id,
      planName: plan.name,
      tagline: plan.tagline,
      who: plan.who,
      benefits: plan.benefits,
      subscribedAt: b.subscribedAt?.toISOString() ?? null,
      currentPeriodEndsAt: b.currentPeriodEndsAt?.toISOString() ?? null,
      currentPriceCents,
      priceChange,
    };
  }

  /**
   * Orçamento de assinatura de um plano (pra tela de confirmação mostrar a
   * promessa de preço + descontos ANTES de confirmar). Não cobra.
   */
  async getQuote(businessId: string, planId: string): Promise<Quote> {
    if (!isPlanId(planId)) throw new BadRequestException('Plano inválido.');
    return quote({ plan: getPlan(planId) });
  }

  /**
   * PONTO DE LIGAÇÃO ÚNICO DA 1ª ATIVAÇÃO. Marca a assinatura como ativa e
   * grava as datas (incl. a data em que o preço de lançamento vira cheio).
   *
   * Chamado pelo endpoint dev (POST /me/plan/confirm, sem `stripe`) e pelo
   * webhook do Stripe na 1ª ativação de verdade (`stripe` preenchido — nesse
   * caso `currentPeriodEndsAt` vem do Stripe em vez de calculado por nós, e os
   * IDs do Stripe são gravados junto). Chamadas de RENOVAÇÃO não passam por
   * aqui — usam `syncActiveFromStripe`, que decide qual dos dois caminhos
   * tomar (ver abaixo).
   */
  async confirmSubscription(
    businessId: string,
    planId: string,
    stripe?: {
      currentPeriodEndsAt: Date;
      stripeCustomerId: string;
      stripeSubscriptionId: string;
    },
  ) {
    if (!isPlanId(planId)) throw new BadRequestException('Plano inválido.');
    const plan = getPlan(planId);

    return this.prisma.$transaction(async (tx) => {
      const b = await tx.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { timezone: true },
      });

      const now = new Date();
      const q = quote({ plan });

      // Ativa a assinatura.
      await tx.business.update({
        where: { id: businessId },
        data: {
          plan: planId,
          subscriptionStatus: 'ACTIVE',
          subscribedAt: now,
          launchPricingEndsAt: launchPricingEndsAt(now, b.timezone, plan),
          currentPeriodEndsAt: stripe?.currentPeriodEndsAt ?? nextRenewalAt(now, b.timezone),
          ...(stripe && {
            stripeCustomerId: stripe.stripeCustomerId,
            stripeSubscriptionId: stripe.stripeSubscriptionId,
          }),
        },
      });

      return {
        ok: true,
        planId,
        firstChargeCents: q.firstChargeCents,
        subscribedAt: now.toISOString(),
      };
    });
  }

  /**
   * Chamado pelo webhook do Stripe sempre que a subscription está `active`
   * (1ª ativação, renovação mensal, ou recuperação depois de PAST_DUE).
   * Decide qual caminho tomar: se `subscribedAt` ainda é null, é a 1ª vez de
   * verdade (roda `confirmSubscription` — launchPricingEndsAt, etc.); senão é
   * só uma atualização de estado/período (NÃO reseta subscribedAt — faria isso
   * de novo a cada renovação mensal).
   */
  async syncActiveFromStripe(params: {
    businessId: string;
    planId: string;
    currentPeriodEndsAt: Date;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  }): Promise<void> {
    if (!isPlanId(params.planId)) return; // metadata malformado — nada a fazer

    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: params.businessId },
      select: { subscribedAt: true },
    });

    if (!business.subscribedAt) {
      await this.confirmSubscription(params.businessId, params.planId, {
        currentPeriodEndsAt: params.currentPeriodEndsAt,
        stripeCustomerId: params.stripeCustomerId,
        stripeSubscriptionId: params.stripeSubscriptionId,
      });
      return;
    }

    // Renovação (mesmo plano) OU troca de plano (StripeService.switchSubscriptionPlan
    // reaproveita a mesma subscription) — grava `plan` sempre, senão um upgrade
    // fica cobrando o preço novo no Stripe mas mostrando o plano antigo aqui.
    await this.prisma.business.update({
      where: { id: params.businessId },
      data: {
        plan: params.planId,
        subscriptionStatus: 'ACTIVE',
        currentPeriodEndsAt: params.currentPeriodEndsAt,
        stripeCustomerId: params.stripeCustomerId,
        stripeSubscriptionId: params.stripeSubscriptionId,
      },
    });
  }

  /** Cobrança de renovação falhou (Stripe já entrou em retry automático). */
  async markPastDue(businessId: string): Promise<void> {
    await this.prisma.business.update({
      where: { id: businessId },
      data: { subscriptionStatus: 'PAST_DUE' },
    });
  }

  /** Assinatura cancelada (esgotou retry, ou o dono cancelou). */
  async markCanceled(businessId: string): Promise<void> {
    await this.prisma.business.update({
      where: { id: businessId },
      data: { subscriptionStatus: 'CANCELED' },
    });
  }
}
