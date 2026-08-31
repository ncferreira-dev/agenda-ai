import { describe, it, expect } from 'vitest';
import { PLANS, planName, savingsLabel, centsFromLabel, type PlanDef } from './plans';

// ---------------------------------------------------------------------------
// Preços dos planos. É a tela que o dono lê antes de decidir pagar — número
// errado aqui é promessa errada, e ela some do preço só na hora da cobrança.
// ---------------------------------------------------------------------------

describe('centsFromLabel', () => {
  it('converte o rótulo em centavos', () => {
    expect(centsFromLabel('59,90')).toBe(5990);
    expect(centsFromLabel('49,90')).toBe(4990);
    expect(centsFromLabel('100,00')).toBe(10000);
  });

  it('tolera "R$" e espaços', () => {
    expect(centsFromLabel('R$ 59,90')).toBe(5990);
  });

  it('completa os centavos que faltam', () => {
    // "59,9" é dez reais de diferença de "59,09" se o preenchimento for pelo
    // lado errado. Aqui o 9 é DEZENA de centavo: 59,90.
    expect(centsFromLabel('59,9')).toBe(5990);
    expect(centsFromLabel('59')).toBe(5900);
  });

  it('não quebra com lixo', () => {
    expect(centsFromLabel('')).toBe(0);
    expect(centsFromLabel('abc')).toBe(0);
  });
});

describe('savingsLabel', () => {
  const plano = (over: Partial<PlanDef>): PlanDef =>
    ({ id: 'PRO', name: 'Pro', priceLabel: '59,90', who: '', tagline: '', features: [], ...over });

  it('mostra a economia sem centavos quando ela é redonda', () => {
    // 79,90 - 59,90 = 20,00 -> "20", e não "20,00".
    expect(savingsLabel(plano({ fullPriceLabel: '79,90' }))).toBe('20');
  });

  it('mostra os centavos quando existem', () => {
    expect(savingsLabel(plano({ priceLabel: '59,90', fullPriceLabel: '80,40' }))).toBe('20,50');
  });

  it('sem preço cheio não há desconto a anunciar', () => {
    expect(savingsLabel(plano({ fullPriceLabel: undefined }))).toBe(null);
  });

  it('não anuncia desconto negativo nem zero', () => {
    // Se alguém trocar os dois preços de lugar, a tela não pode dizer
    // "economize -20" nem "economize 0".
    expect(savingsLabel(plano({ priceLabel: '79,90', fullPriceLabel: '59,90' }))).toBe(null);
    expect(savingsLabel(plano({ priceLabel: '59,90', fullPriceLabel: '59,90' }))).toBe(null);
  });
});

describe('catálogo de planos', () => {
  it('planName devolve o nome, e o id cru se o plano sumir', () => {
    expect(planName('PRO')).toBe('Pro');
    expect(planName('START')).toBe('Start');
    // Não pode explodir se um id antigo continuar gravado num negócio.
    expect(planName('LEGADO' as never)).toBe('LEGADO');
  });

  it('todo plano promocional é mais barato que o cheio', () => {
    // Trava contra edição desatenta da tabela de preços.
    for (const p of PLANS) {
      if (!p.fullPriceLabel) continue;
      expect(centsFromLabel(p.priceLabel), p.name).toBeLessThan(centsFromLabel(p.fullPriceLabel));
    }
  });

  it('exatamente um plano é o recomendado', () => {
    expect(PLANS.filter((p) => p.recommended)).toHaveLength(1);
  });

  it('os ids são únicos', () => {
    expect(new Set(PLANS.map((p) => p.id)).size).toBe(PLANS.length);
  });
});
