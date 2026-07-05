// ---------------------------------------------------------------------------
// Preço efetivo de um serviço (puro, sem banco -> testável).
// Única fonte da verdade do preço COM desconto. Reusado pela página pública, pelo
// agente e pelo snapshot do booking (o valor gravado no item-espelho e no
// totalCents). Kit é só um Service com preço próprio, então usa o mesmo cálculo.
// Rode os testes com `npm run test:pricing-service`.
// ---------------------------------------------------------------------------

export type DiscountKind = 'PERCENT' | 'FIXED';

export interface Priceable {
  priceCents: number;
  /** null = sem desconto */
  discountKind: DiscountKind | null;
  /** PERCENT: 1–99 | FIXED: centavos abatidos. Ignorado quando discountKind é null. */
  discountValue: number;
}

/**
 * Preço final em centavos, já com o desconto aplicado. Nunca negativo.
 * PERCENT arredonda pro centavo mais próximo; FIXED subtrai e trava em 0.
 */
export function effectivePriceCents(s: Priceable): number {
  const base = Math.max(0, Math.round(s.priceCents));
  if (!s.discountKind || !s.discountValue || s.discountValue <= 0) return base;

  if (s.discountKind === 'PERCENT') {
    const pct = Math.min(100, s.discountValue);
    return Math.max(0, Math.round(base * (100 - pct) / 100));
  }
  // FIXED
  return Math.max(0, base - Math.round(s.discountValue));
}

/** Há desconto de fato aplicado (kind definido, valor > 0 e o preço final é menor)? */
export function hasDiscount(s: Priceable): boolean {
  return effectivePriceCents(s) < Math.max(0, Math.round(s.priceCents));
}
