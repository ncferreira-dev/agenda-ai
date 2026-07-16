import { DateTime } from 'luxon';
import { LAUNCH_PRICING_MONTHS, type PlanDef } from './plan-catalog';

// ---------------------------------------------------------------------------
// Motor de preço da assinatura. PURO (só depende de Luxon p/ datas). É a fonte
// da verdade do que é cobrado e do texto de disclosure. Testado em pricing.spec.ts
// (`npm run test:pricing`) — mesma disciplina do slot-engine (regra de ouro 3).
//
// Nada aqui cobra: quem consome é a tela de confirmação (mostra o quote antes de
// assinar) e o BillingService (grava as datas no ato). O checkout Stripe,
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

export interface QuoteInput {
  plan: PlanDef;
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
  firstChargeCents: number; // total cobrado no 1º mês
  lineItems: QuoteLine[]; // quebra pra exibir na confirmação
  /** Promessa de preço por escrito (requisito do lançamento). */
  disclosureText: string;
  firstMonthNote: string | null;
}

/**
 * Monta o orçamento da assinatura de um plano. Não cobra — só calcula e descreve.
 */
export function quote(input: QuoteInput): Quote {
  const { plan } = input;
  const transition = hasLaunchTransition(plan);

  const lineItems: QuoteLine[] = [
    { label: `Plano ${plan.name} (preço de lançamento)`, amountCents: plan.promoCents },
  ];

  const disclosureText = transition
    ? `${formatBRL(plan.promoCents)}/mês nos ${LAUNCH_PRICING_MONTHS} primeiros meses, depois ${formatBRL(plan.fullCents)}/mês.`
    : `${formatBRL(plan.promoCents)}/mês.`;

  return {
    promoCents: plan.promoCents,
    fullCents: plan.fullCents,
    hasTransition: transition,
    firstChargeCents: plan.promoCents,
    lineItems,
    disclosureText,
    firstMonthNote: null,
  };
}
