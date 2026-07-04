import { getMe } from '@/lib/panel-api';
import { PLANS, planName, savingsLabel, type PlanId } from './plans';
import { AssinarButton } from './AssinarButton';
import panel from '../../painel.module.css';
import styles from './planos.module.css';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

// Monta o banner de status do topo a partir do estado de assinatura do negócio.
// Só leitura — nenhuma cobrança acontece aqui.
function statusBanner(business: {
  subscriptionStatus: string;
  plan: PlanId | null;
  trialEndsAt: string | null;
}) {
  const { subscriptionStatus, plan, trialEndsAt } = business;

  if (subscriptionStatus === 'ACTIVE' && plan) {
    return { tone: 'ok' as const, title: `Plano atual: ${planName(plan)}`, hint: 'Assinatura ativa.' };
  }
  if (subscriptionStatus === 'PAST_DUE') {
    return {
      tone: 'warn' as const,
      title: 'Pagamento pendente',
      hint: 'Regularize pra manter sua agenda no ar.',
    };
  }
  if (subscriptionStatus === 'CANCELED') {
    return {
      tone: 'warn' as const,
      title: 'Assinatura cancelada',
      hint: 'Escolha um plano pra reativar quando quiser.',
    };
  }

  // TRIALING (ou estado inicial sem plano).
  if (trialEndsAt) {
    const daysLeft = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / DAY_MS);
    if (daysLeft <= 0) {
      return {
        tone: 'warn' as const,
        title: 'Seu teste grátis terminou',
        hint: 'Escolha um plano pra continuar usando.',
      };
    }
    const dias = daysLeft === 1 ? '1 dia' : `${daysLeft} dias`;
    return {
      tone: 'ok' as const,
      title: `Teste grátis (faltam ${dias})`,
      hint: 'Você está usando tudo, sem custo. Escolha um plano antes de acabar.',
    };
  }

  return { tone: 'ok' as const, title: 'Teste grátis', hint: 'Escolha um plano quando quiser.' };
}

export default async function PlanosPage() {
  const me = await getMe();
  if (!me) return null;

  const banner = statusBanner(me.business);
  const isActive = me.business.subscriptionStatus === 'ACTIVE';

  return (
    <div className={panel.rise}>
      <div className={panel.pageHead}>
        <div>
          <p className={panel.eyebrow}>Assinatura</p>
          <h1 className={panel.h1}>Planos</h1>
          <p className={panel.lead}>
            Escolha o plano do tamanho da sua operação. Você pode trocar quando quiser.
          </p>
        </div>
      </div>

      {/* Status atual da assinatura */}
      <div className={`${styles.banner} ${banner.tone === 'warn' ? styles.bannerWarn : styles.bannerOk}`}>
        <div>
          <p className={styles.bannerTitle}>{banner.title}</p>
          <p className={styles.bannerHint}>{banner.hint}</p>
        </div>
      </div>

      {/* Cards dos três planos */}
      <div className={styles.grid}>
        {PLANS.map((p) => {
          const isCurrent = isActive && me.business.plan === p.id;
          const savings = savingsLabel(p);
          return (
            <div
              key={p.id}
              className={`${styles.card} ${p.recommended ? styles.cardRecommended : ''} ${
                p.id === 'ULTRA' ? styles.cardUltra : ''
              } ${isCurrent ? styles.cardCurrent : ''}`}
            >
              {p.recommended && <span className={styles.ribbon}>Mais escolhido</span>}

              <h2 className={styles.planName}>{p.name}</h2>
              <p className={styles.planTagline}>{p.tagline}</p>
              <p className={styles.planWho}>{p.who}</p>

              <div className={styles.priceWrap}>
                {p.fullPriceLabel && <span className={styles.priceFull}>R$ {p.fullPriceLabel}</span>}
                <p className={styles.price}>
                  <span className={styles.priceCurrency}>R$</span>
                  <span className={styles.priceValue}>{p.priceLabel}</span>
                  <span className={styles.pricePer}>/mês</span>
                </p>
                {p.fullPriceLabel && (
                  <div className={styles.launchRow}>
                    <span className={styles.launchBadge}>🏷 Preço de lançamento</span>
                    {savings && <span className={styles.saveTag}>economize R$ {savings}/mês</span>}
                  </div>
                )}
              </div>

              <ul className={styles.features}>
                {p.features.map((f) => (
                  <li key={f}>
                    <span className={styles.check} aria-hidden="true">
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <AssinarButton planId={p.id} recommended={p.recommended} isCurrent={isCurrent} />
            </div>
          );
        })}
      </div>

      <p className={styles.foot}>Planos com desconto no semestral e no anual. Cancele quando quiser.</p>
    </div>
  );
}
