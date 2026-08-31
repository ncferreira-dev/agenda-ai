import { getMe, getQuote, type Quote } from '@/lib/panel-api';
import { PLANS, planName, savingsLabel, type PlanId } from './plans';
import { statusBanner } from './planos.utils';
import { AssinarButton } from './AssinarButton';
import { ManageSubscriptionButton } from './ManageSubscriptionButton';
import panel from '../../painel.module.css';
import styles from './planos.module.css';

export const dynamic = 'force-dynamic';

export default async function PlanosPage({
  searchParams,
}: {
  searchParams: { checkout?: string };
}) {
  const me = await getMe();
  if (!me) return null;

  // Volta do redirect do Stripe (success_url/cancel_url). Quem ativa de
  // verdade é o webhook — isso é só feedback imediato pro dono, que pode
  // chegar aqui antes do webhook processar.
  const checkoutFeedback =
    searchParams.checkout === 'sucesso'
      ? {
          tone: 'ok' as const,
          title: 'Pagamento recebido!',
          hint: 'Pode levar alguns segundos pra confirmar. Atualize a página em instantes.',
        }
      : searchParams.checkout === 'cancelado'
        ? {
            tone: 'warn' as const,
            title: 'Checkout cancelado',
            hint: 'Nenhuma cobrança foi feita. Pode tentar de novo quando quiser.',
          }
        : null;

  const banner = statusBanner(me.business);
  const isActive = me.business.subscriptionStatus === 'ACTIVE';

  // Orçamento de cada plano (promessa de preço), calculado no backend.
  // Alimenta a confirmação.
  const quotes = new Map<PlanId, Quote>();
  await Promise.all(
    PLANS.map(async (p) => {
      try {
        quotes.set(p.id, await getQuote(p.id));
      } catch {
        /* sem quote: o botão ainda abre, só não mostra a quebra */
      }
    }),
  );

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

      {/* Feedback da volta do Stripe (success_url/cancel_url) */}
      {checkoutFeedback && (
        <div
          className={`${styles.banner} ${checkoutFeedback.tone === 'warn' ? styles.bannerWarn : styles.bannerOk}`}
        >
          <div>
            <p className={styles.bannerTitle}>{checkoutFeedback.title}</p>
            <p className={styles.bannerHint}>{checkoutFeedback.hint}</p>
          </div>
        </div>
      )}

      {/* Status atual da assinatura */}
      <div className={`${styles.banner} ${banner.tone === 'warn' ? styles.bannerWarn : styles.bannerOk}`}>
        <div>
          <p className={styles.bannerTitle}>{banner.title}</p>
          <p className={styles.bannerHint}>{banner.hint}</p>
        </div>
        {['ACTIVE', 'PAST_DUE', 'CANCELED'].includes(me.business.subscriptionStatus) && (
          <ManageSubscriptionButton />
        )}
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

              <AssinarButton
                planId={p.id}
                planName={p.name}
                recommended={p.recommended}
                isCurrent={isCurrent}
                quote={quotes.get(p.id) ?? null}
              />
            </div>
          );
        })}
      </div>

      <p className={styles.foot}>Planos com desconto no semestral e no anual. Cancele quando quiser.</p>
    </div>
  );
}
