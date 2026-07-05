import { DateTime } from 'luxon';
import {
  LAUNCH_PRICING_MONTHS,
  REFERRED_FIRST_MONTH_DISCOUNT,
  type PlanDef,
} from './plan-catalog';

// ---------------------------------------------------------------------------
// Motor de preço da assinatura. PURO (só depende de Luxon p/ datas). É a fonte
// da verdade do que é cobrado e do texto de disclosure. Testado em pricing.spec.ts
// (`npm run test:pricing`) — mesma disciplina do slot-engine (regra de ouro 3).
//
// Nada aqui cobra: quem consome é a tela de confirmação (mostra o quote antes de
// assinar) e o BillingService (grava as datas no ato). O checkout Mercado Pago,
// quando existir, lê o mesmo quote pra abrir a cobrança.
// ---------------------------------------------------------------------------

/** "R$ 49,90" a partir de centavos. */
export function formatBRL(cents: number): string {
  const reais = (cents / 100).toFixed(2).replace('.', ',');
  return `R$ ${reais}`;
}

/** Plano tem transição de preço (lançamento -> cheio)? Start = false. */
export function hasLaunchTransition(plan: PlanDef): boolean {
  return plan.fullCents > plan.promoCents;
}

/**
 * Data em que o preço de lançamento acaba e passa ao cheio: subscribedAt + 3
 * meses no fuso do negócio. Retorna null quando o plano não tem transição
 * (Start). É o valor gravado em Business.launchPricingEndsAt.
 */
export function launchPricingEndsAt(
  subscribedAt: Date,
  timezone: string,
  plan: PlanDef,
): Date | null {
  if (!hasLaunchTransition(plan)) return null;
  return DateTime.fromJSDate(subscribedAt, { zone: timezone })
    .plus({ months: LAUNCH_PRICING_MONTHS })
    .toJSDate();
}

/** Próxima renovação: subscribedAt + 1 mês no fuso do negócio. */
export function nextRenewalAt(subscribedAt: Date, timezone: string): Date {
  return DateTime.fromJSDate(subscribedAt, { zone: timezone })
    .plus({ months: 1 })
    .toJSDate();
}

// Desconto do indicado no 1º mês, em centavos (arredondado).
export function referredDiscountCents(plan: PlanDef): number {
  return Math.round(plan.promoCents * REFERRED_FIRST_MONTH_DISCOUNT);
}

export interface QuoteInput {
  plan: PlanDef;
  /** Este negócio veio de uma indicação ainda não convertida? (ganha 10% no 1º mês) */
  referred: boolean;
  /** Crédito acumulado de indicações feitas por este negócio (abatido no 1º mês). */
  referralCreditCents: number;
}

export interface QuoteLine {
  label: string;
  /** Positivo = cobrança; negativo = desconto. Em centavos. */
  amountCents: number;
}

export interface Quote {
  promoCents: number; // preço de lançamento (mensal, 3 primeiros meses)
  fullCents: number; // preço cheio (mensal, após os 3 meses)
  hasTransition: boolean;
  referredDiscountCents: number; // 10% do 1º mês (0 se não veio de indicação)
  creditAppliedCents: number; // crédito abatido no 1º mês
  firstChargeCents: number; // total cobrado no 1º mês (após descontos)
  lineItems: QuoteLine[]; // quebra pra exibir na confirmação
  /** Promessa de preço por escrito (requisito do lançamento). */
  disclosureText: string;
  /** Nota do 1º mês quando há desconto de indicação/crédito; null se não houver. */
  firstMonthNote: string | null;
}

/**
 * Monta o orçamento da assinatura de um plano. Não cobra — só calcula e descreve.
 */
export function quote(input: QuoteInput): Quote {
  const { plan } = input;
  const transition = hasLaunchTransition(plan);

  const discount = input.referred ? referredDiscountCents(plan) : 0;
  const afterDiscount = plan.promoCents - discount;
  const credit = Math.max(0, Math.min(input.referralCreditCents, afterDiscount));
  const firstChargeCents = afterDiscount - credit;

  const lineItems: QuoteLine[] = [
    { label: `Plano ${plan.name} (preço de lançamento)`, amountCents: plan.promoCents },
  ];
  if (discount > 0) {
    lineItems.push({ label: 'Desconto de indicação (10% no 1º mês)', amountCents: -discount });
  }
  if (credit > 0) {
    lineItems.push({ label: 'Crédito de indicações', amountCents: -credit });
  }

  const disclosureText = transition
    ? `${formatBRL(plan.promoCents)}/mês nos ${LAUNCH_PRICING_MONTHS} primeiros meses, depois ${formatBRL(plan.fullCents)}/mês.`
    : `${formatBRL(plan.promoCents)}/mês.`;

  let firstMonthNote: string | null = null;
  if (discount > 0 || credit > 0) {
    const partes: string[] = [];
    if (discount > 0) partes.push('10% de indicação');
    if (credit > 0) partes.push(`${formatBRL(credit)} de crédito`);
    firstMonthNote = `No 1º mês você paga ${formatBRL(firstChargeCents)} (${partes.join(' + ')}).`;
  }

  return {
    promoCents: plan.promoCents,
    fullCents: plan.fullCents,
    hasTransition: transition,
    referredDiscountCents: discount,
    creditAppliedCents: credit,
    firstChargeCents,
    lineItems,
    disclosureText,
    firstMonthNote,
  };
}
