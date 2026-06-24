import { getMe } from '@/lib/panel-api';
import { BusinessForm } from './BusinessForm';
import styles from '../../painel.module.css';

export const dynamic = 'force-dynamic';

export default async function NegocioPage() {
  const me = await getMe();
  if (!me) return null;

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Configuração</p>
          <h1 className={styles.h1}>Negócio</h1>
          <p className={styles.lead}>Nome, WhatsApp, fuso e como os horários são ofertados.</p>
        </div>
      </div>

      <BusinessForm business={me.business} />
    </div>
  );
}
