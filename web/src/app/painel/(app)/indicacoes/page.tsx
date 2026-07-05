import { getReferralStats } from '@/lib/panel-api';
import panel from '../../painel.module.css';
import styles from './indicacoes.module.css';
import { ReferralLink } from './ReferralLink';

export const dynamic = 'force-dynamic';

function brl(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export default async function IndicacoesPage() {
  const s = await getReferralStats();

  return (
    <div className={panel.rise}>
      <div className={panel.pageHead}>
        <div>
          <p className={panel.eyebrow}>Indique e ganhe</p>
          <h1 className={panel.h1}>Indicações</h1>
          <p className={panel.lead}>
            Indique outros donos e vocês dois ganham. Quem entra pelo seu link ganha{' '}
            <strong>10% no 1º mês</strong>; você ganha <strong>crédito</strong> quando essa
            pessoa assina.
          </p>
        </div>
      </div>

      {/* Link/código de indicação */}
      <ReferralLink code={s.code} />

      {/* Números */}
      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <p className={styles.statValue}>{s.totalReferrals}</p>
          <p className={styles.statLabel}>Cadastros pelo seu link</p>
        </div>
        <div className={styles.stat}>
          <p className={styles.statValue}>{s.convertedReferrals}</p>
          <p className={styles.statLabel}>Já assinaram</p>
        </div>
        <div className={styles.stat}>
          <p className={styles.statValue}>{s.pendingReferrals}</p>
          <p className={styles.statLabel}>Ainda no teste</p>
        </div>
        <div className={`${styles.stat} ${styles.statHighlight}`}>
          <p className={styles.statValue}>{brl(s.creditCents)}</p>
          <p className={styles.statLabel}>Crédito acumulado</p>
        </div>
      </div>

      <div className={styles.how}>
        <h3 className={styles.howTitle}>Como funciona</h3>
        <ol className={styles.howList}>
          <li>Compartilhe seu link com outros donos de negócio.</li>
          <li>Quem se cadastra por ele ganha 10% de desconto no 1º mês ao assinar.</li>
          <li>
            Quando essa pessoa assina, você ganha crédito (o valor do 1º mês dela), abatido
            na sua próxima cobrança.
          </li>
        </ol>
        <p className={styles.howFoot}>
          O desconto e o crédito são aplicados no pagamento — entram assim que o checkout
          estiver ativo. A atribuição (quem veio de quem) já é registrada agora.
        </p>
      </div>
    </div>
  );
}
