// Catálogo de planos do agend.ai — FONTE ÚNICA DA VERDADE dos preços no backend.
// A cobrança (checkout Mercado Pago, Fase 5) e as telas de assinatura leem daqui.
// A UI de marketing (web/.../planos/plans.ts + landing) espelha estes valores.
//
// Preço de lançamento: `promoCents` vale os 3 primeiros meses da assinatura;
// depois passa a `fullCents`. Quando `fullCents === promoCents`, o plano não tem
// transição (ex.: Start, promo permanente) e não há data de mudança.

export type PlanId = 'START' | 'PRO' | 'ULTRA';

// Por quantos meses vale o preço de lançamento antes de virar o preço cheio.
export const LAUNCH_PRICING_MONTHS = 3;

// Desconto do INDICADO no 1º mês (fração). Aplicado no checkout via BillingService.
export const REFERRED_FIRST_MONTH_DISCOUNT = 0.1; // 10%

// Um benefício acionável do plano: texto + rota do painel pra onde o botão leva.
// É o que a aba "Meu plano" mostra (cada item vira um card com um botão).
export interface PlanBenefit {
  label: string;
  href: string;
}

export interface PlanDef {
  id: PlanId;
  name: string;
  /** Preço de lançamento (3 primeiros meses), em centavos. */
  promoCents: number;
  /** Preço cheio (após os 3 meses), em centavos. Igual ao promo = sem transição. */
  fullCents: number;
  /** Faixa de profissionais que o plano atende. */
  who: string;
  /** Frase curta de posicionamento. */
  tagline: string;
  /** Plano sugerido (destaque visual). */
  recommended?: boolean;
  /** Benefícios com destino — usados na aba "Meu plano". */
  benefits: PlanBenefit[];
}

export const PLAN_CATALOG: Record<PlanId, PlanDef> = {
  START: {
    id: 'START',
    name: 'Start',
    promoCents: 4990,
    fullCents: 4990, // promo permanente: Start não sobe após os 3 meses
    who: '1 a 3 profissionais',
    tagline: 'Pra quem está começando',
    benefits: [
      { label: 'Sua agenda e link de agendamento', href: '/painel' },
      { label: 'Agendamento pelo WhatsApp', href: '/painel/divulgar' },
      { label: 'Fidelidade e aniversário dos clientes', href: '/painel/clientes' },
      { label: 'Relatório de faturamento', href: '/painel/relatorio' },
    ],
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    promoCents: 5990,
    fullCents: 7990,
    who: '4 a 6 profissionais',
    tagline: 'Pra quem quer crescer',
    recommended: true,
    benefits: [
      { label: 'Tudo do Start', href: '/painel' },
      { label: 'Lembretes e retorno de clientes', href: '/painel/notificacoes' },
      { label: 'Catálogo, combos e promoções', href: '/painel/servicos' },
      { label: 'Relatórios completos (pico, faltas, tempo)', href: '/painel/relatorio' },
      { label: 'Bloqueios e folgas na agenda', href: '/painel/bloqueios' },
    ],
  },
  ULTRA: {
    id: 'ULTRA',
    name: 'Ultra',
    promoCents: 6990,
    fullCents: 9990,
    who: '7+ profissionais',
    tagline: 'Pra operação completa',
    benefits: [
      { label: 'Tudo do Pro', href: '/painel' },
      { label: 'Relatórios estratégicos + exportação', href: '/painel/relatorio' },
      { label: 'Ranking de clientes e retornos em massa', href: '/painel/clientes' },
      { label: 'Vários profissionais e serviços', href: '/painel/profissionais' },
      { label: 'Personalização completa da página', href: '/painel/aparencia' },
    ],
  },
};

export const PLAN_IDS: PlanId[] = ['START', 'PRO', 'ULTRA'];

export function isPlanId(v: unknown): v is PlanId {
  return v === 'START' || v === 'PRO' || v === 'ULTRA';
}

export function getPlan(id: PlanId): PlanDef {
  return PLAN_CATALOG[id];
}

export function planName(id: PlanId): string {
  return PLAN_CATALOG[id]?.name ?? id;
}
