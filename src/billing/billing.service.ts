import { BadRequestException, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
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

// Recompensa do INDICADOR por indicação convertida: crédito equivalente ao 1º
// mês pago pelo indicado (o promo do plano que ele assinou). Empilha em
// Business.referralCreditCents e é abatido na próxima cobrança do indicador.
function referrerRewardCents(plan: ReturnType<typeof getPlan>): number {
  return plan.promoCents;
}

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
  referralCreditCents: number;
}

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  /** Este negócio veio de uma indicação que ainda não foi convertida? */
  private async isReferredPending(businessId: string): Promise<boolean> {
    const ref = await this.prisma.referral.findUnique({
      where: { referredBusinessId: businessId },
      select: { status: true },
    });
    return ref?.status === 'PENDING';
  }

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
        referralCreditCents: true,
      },
    });

    const base = {
      status: b.subscriptionStatus,
      trialEndsAt: b.trialEndsAt?.toISOString() ?? null,
      referralCreditCents: b.referralCreditCents,
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
    const b = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { referralCreditCents: true },
    });
    const referred = await this.isReferredPending(businessId);
    return quote({
      plan: getPlan(planId),
      referred,
      referralCreditCents: b.referralCreditCents,
    });
  }

  /**
   * PONTO DE LIGAÇÃO ÚNICO DO CHECKOUT. Marca a assinatura como ativa, grava as
   * datas (incl. a data em que o preço de lançamento vira cheio) e realiza os
   * benefícios de indicação (desconto do indicado + crédito do indicador).
   *
   * Hoje é chamado pelo endpoint dev (POST /me/plan/confirm) pra dar pra ver as
   * telas funcionando. Quando o Stripe entrar, o WEBHOOK de pagamento
   * aprovado chama exatamente este método — nada mais muda.
   */
  async confirmSubscription(businessId: string, planId: string) {
    if (!isPlanId(planId)) throw new BadRequestException('Plano inválido.');
    const plan = getPlan(planId);

    return this.prisma.$transaction(async (tx) => {
      const b = await tx.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { timezone: true, referralCreditCents: true },
      });

      const referral = await tx.referral.findUnique({
        where: { referredBusinessId: businessId },
        select: { id: true, status: true, referrerBusinessId: true },
      });
      const referred = referral?.status === 'PENDING';

      const now = new Date();
      const q = quote({
        plan,
        referred,
        referralCreditCents: b.referralCreditCents,
      });

      // Ativa a assinatura e consome o crédito aplicado no 1º mês.
      await tx.business.update({
        where: { id: businessId },
        data: {
          plan: planId,
          subscriptionStatus: 'ACTIVE',
          subscribedAt: now,
          launchPricingEndsAt: launchPricingEndsAt(now, b.timezone, plan),
          currentPeriodEndsAt: nextRenewalAt(now, b.timezone),
          referralCreditCents: { decrement: q.creditAppliedCents },
        },
      });

      // Realiza a indicação: marca o desconto do indicado e credita o indicador.
      if (referral && referred) {
        await tx.referral.update({
          where: { id: referral.id },
          data: {
            status: 'CONVERTED',
            convertedAt: now,
            referredDiscountApplied: q.referredDiscountCents > 0,
            referrerRewarded: true,
          },
        });
        await tx.business.update({
          where: { id: referral.referrerBusinessId },
          data: { referralCreditCents: { increment: referrerRewardCents(plan) } },
        });
      }

      return {
        ok: true,
        planId,
        firstChargeCents: q.firstChargeCents,
        subscribedAt: now.toISOString(),
      };
    });
  }
}
