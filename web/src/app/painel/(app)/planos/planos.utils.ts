import { planName, type PlanId } from './plans';

// ---------------------------------------------------------------------------
// O banner de status da assinatura: é a frase que o dono lê no topo da tela de
// planos e que decide se ele acha que precisa fazer alguma coisa hoje.
//
// Estava dentro do page.tsx com `Date.now()` embutido, o que a tornava
// intestável: não havia como perguntar "o que aparece no penúltimo dia do
// teste?" sem mexer no relógio da máquina. `agora` é parâmetro por isso.
// ---------------------------------------------------------------------------

const DIA_MS = 24 * 60 * 60 * 1000;

export interface EstadoDaAssinatura {
  subscriptionStatus: string;
  plan: PlanId | null;
  trialEndsAt: string | null;
}

export interface Banner {
  tone: 'ok' | 'warn';
  title: string;
  hint: string;
}

/**
 * A PRECEDÊNCIA é a regra, e é o que mais tem chance de ser invertido numa
 * edição distraída: assinatura ativa manda em tudo; depois pagamento pendente;
 * depois cancelada; e só então o teste grátis. Um negócio com pagamento
 * pendente NÃO pode ver "teste grátis" só porque ainda tem trialEndsAt no banco.
 */
export function statusBanner(business: EstadoDaAssinatura, agora: Date = new Date()): Banner {
  const { subscriptionStatus, plan, trialEndsAt } = business;

  if (subscriptionStatus === 'ACTIVE' && plan) {
    return { tone: 'ok', title: `Plano atual: ${planName(plan)}`, hint: 'Assinatura ativa.' };
  }
  if (subscriptionStatus === 'PAST_DUE') {
    return {
      tone: 'warn',
      title: 'Pagamento pendente',
      hint: 'Regularize pra manter sua agenda no ar.',
    };
  }
  if (subscriptionStatus === 'CANCELED') {
    return {
      tone: 'warn',
      title: 'Assinatura cancelada',
      hint: 'Escolha um plano pra reativar quando quiser.',
    };
  }

  // TRIALING (ou estado inicial sem plano).
  if (trialEndsAt) {
    const daysLeft = Math.ceil((new Date(trialEndsAt).getTime() - agora.getTime()) / DIA_MS);
    if (daysLeft <= 0) {
      return {
        tone: 'warn',
        title: 'Seu teste grátis terminou',
        hint: 'Escolha um plano pra continuar usando.',
      };
    }
    const dias = daysLeft === 1 ? '1 dia' : `${daysLeft} dias`;
    return {
      tone: 'ok',
      title: `Teste grátis (faltam ${dias})`,
      hint: 'Você está usando tudo, sem custo. Escolha um plano antes de acabar.',
    };
  }

  return { tone: 'ok', title: 'Teste grátis', hint: 'Escolha um plano quando quiser.' };
}
