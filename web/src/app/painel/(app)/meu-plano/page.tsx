import Link from 'next/link';
import { getMyPlan } from '@/lib/panel-api';
import panel from '../../painel.module.css';
import styles from './meu-plano.module.css';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

function brl(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function dataBR(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export default async function MeuPlanoPage() {
  const p = await getMyPlan();

  // Ainda não assinou: mostra o estado do teste e leva pra escolher um plano.
  if (p.status !== 'ACTIVE' || !p.planId) {
    const diasTrial =
      p.trialEndsAt != null
        ? Math.ceil((new Date(p.trialEndsAt).getTime() - Date.now()) / DAY_MS)
        : null;
    return (
      <div className={panel.rise}>
        <div className={panel.pageHead}>
          <div>
            <p className={panel.eyebrow}>Assinatura</p>
            <h1 className={panel.h1}>Meu plano</h1>
            <p className={panel.lead}>Aqui fica tudo sobre a sua assinatura.</p>
          </div>
        </div>

        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>
            {diasTrial != null && diasTrial > 0
              ? `Você está no teste grátis (faltam ${diasTrial === 1 ? '1 dia' : `${diasTrial} dias`})`
              : 'Você ainda não tem um plano ativo'}
          </h2>
          <p className={styles.emptyHint}>
            Escolha um plano pra garantir o preço de lançamento e continuar com tudo funcionando.
          </p>
          <Link href="/painel/planos" className={styles.primaryBtn}>
            Escolher plano
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={panel.rise}>
      <div className={panel.pageHead}>
        <div>
          <p className={panel.eyebrow}>Assinatura</p>
          <h1 className={panel.h1}>Meu plano</h1>
          <p className={panel.lead}>Seu plano, renovação e o que está incluído.</p>
        </div>
        <Link href="/painel/planos" className={styles.switchBtn}>
          Trocar de plano
        </Link>
      </div>

      {/* Cabeçalho do plano + preço atual */}
      <div className={styles.hero}>
        <div>
          <p className={styles.planTag}>Plano atual</p>
          <h2 className={styles.planName}>{p.planName}</h2>
          {p.tagline && <p className={styles.planSub}>{p.tagline}</p>}
          {p.who && <p className={styles.planWho}>{p.who}</p>}
        </div>
        {p.currentPriceCents != null && (
          <div className={styles.priceBox}>
            <span className={styles.priceValue}>{brl(p.currentPriceCents)}</span>
            <span className={styles.pricePer}>/mês</span>
          </div>
        )}
      </div>

      {/* Fatos da assinatura */}
      <div className={styles.factGrid}>
        {p.currentPeriodEndsAt && (
          <div className={styles.fact}>
            <p className={styles.factLabel}>Renova em</p>
            <p className={styles.factValue}>{dataBR(p.currentPeriodEndsAt)}</p>
          </div>
        )}
        {p.subscribedAt && (
          <div className={styles.fact}>
            <p className={styles.factLabel}>Assinante desde</p>
            <p className={styles.factValue}>{dataBR(p.subscribedAt)}</p>
          </div>
        )}
      </div>

      {/* Aviso da mudança de preço (fim do preço de lançamento) */}
      {p.priceChange && (
        <div className={styles.changeNote}>
          <span aria-hidden="true">🏷</span>
          <span>
            Preço de lançamento. A partir de <strong>{dataBR(p.priceChange.at)}</strong> sua
            assinatura passa a <strong>{brl(p.priceChange.toCents)}/mês</strong>.
          </span>
        </div>
      )}

      {/* Benefícios com atalho pra cada funcionalidade */}
      <h3 className={styles.sectionTitle}>O que seu plano inclui</h3>
      <div className={styles.benefits}>
        {p.benefits.map((b) => (
          <Link key={b.href + b.label} href={b.href} className={styles.benefit}>
            <span className={styles.benefitCheck} aria-hidden="true">
              ✓
            </span>
            <span className={styles.benefitLabel}>{b.label}</span>
            <span className={styles.benefitArrow} aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
