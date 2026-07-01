// Fonte única dos planos do agend.ai. Mesma redação da landing (index.html, seção
// #planos) e da matriz de recursos do ROADMAP. Usada só pra montar a tela — a
// cobrança (Fase 5) lê o `id` daqui pra abrir o checkout do Mercado Pago.

export type PlanId = 'START' | 'PRO' | 'ULTRA';

export interface PlanDef {
  id: PlanId;
  name: string;
  /** Preço mensal formatado (sem "R$"), ex.: "49,90". */
  priceLabel: string;
  /** Faixa de profissionais que o plano atende (regra de enquadramento). */
  who: string;
  /** Frase curta de posicionamento. */
  tagline: string;
  /** O que está incluído (cada item vira uma linha com ✓). */
  features: string[];
  /** Destaque visual: o plano sugerido. */
  recommended?: boolean;
}

export const PLANS: PlanDef[] = [
  {
    id: 'START',
    name: 'Start',
    priceLabel: '49,90',
    who: '1 a 3 profissionais',
    tagline: 'Pra quem está começando',
    features: [
      'Agenda e link de agendamento',
      'Agendamento pelo WhatsApp',
      'Fidelidade e aniversário',
      'Relatório básico de faturamento',
      'Histórico de 3 meses',
    ],
  },
  {
    id: 'PRO',
    name: 'Pro',
    priceLabel: '59,90',
    who: '4 a 6 profissionais',
    tagline: 'Pra quem quer crescer',
    recommended: true,
    features: [
      'Tudo do Start',
      'Lembretes e retorno de clientes',
      'Catálogo, combos e promoções',
      'Relatórios completos (pico, faltas, tempo)',
      'Histórico de 6 meses',
    ],
  },
  {
    id: 'ULTRA',
    name: 'Ultra',
    priceLabel: '69,90',
    who: '7+ profissionais',
    tagline: 'Pra operação completa',
    features: [
      'Tudo do Pro',
      'Relatórios estratégicos + exportação',
      'Ranking de clientes e retornos em massa',
      'Multi-unidades e login por profissional',
      'Histórico vitalício',
    ],
  },
];

/** Rótulo amigável de um plano pelo id (pra mostrar "Plano atual: Pro"). */
export function planName(id: PlanId): string {
  return PLANS.find((p) => p.id === id)?.name ?? id;
}
