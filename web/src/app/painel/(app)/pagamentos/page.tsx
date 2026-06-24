import { getMe } from '@/lib/panel-api';
import { PaymentsForm } from './PaymentsForm';
import styles from '../../painel.module.css';

export const dynamic = 'force-dynamic';

export default async function PagamentosPage() {
  const me = await getMe();
  if (!me) return null;

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Configuração</p>
          <h1 className={styles.h1}>Pagamentos</h1>
          <p className={styles.lead}>Cobre um sinal no ato pra reduzir falta. O cliente paga e o horário confirma.</p>
        </div>
      </div>

      <PaymentsForm business={me.business} />
    </div>
  );
}
