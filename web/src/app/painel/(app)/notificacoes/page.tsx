import { getMe } from '@/lib/panel-api';
import { NotificationsForm } from './NotificationsForm';
import styles from '../../painel.module.css';

export const dynamic = 'force-dynamic';

export default async function NotificacoesPage() {
  const me = await getMe();
  if (!me) return null;

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Configuração</p>
          <h1 className={styles.h1}>Notificações</h1>
          <p className={styles.lead}>Receba um aviso quando entrar agendamento, e o resumo da agenda toda manhã.</p>
        </div>
      </div>

      <NotificationsForm business={me.business} ownerPhone={me.owner.phone} ownerEmail={me.owner.email} />
    </div>
  );
}
