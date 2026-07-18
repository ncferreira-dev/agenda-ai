import { getMe, listCustomers } from '@/lib/panel-api';
import { ClientesView } from './ClientesView';
import { SegmentationConfig } from './SegmentationConfig';
import styles from '../../painel.module.css';

export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  const [me, customers] = await Promise.all([getMe(), listCustomers()]);
  if (!me) return null;

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Painel</p>
          <h1 className={styles.h1}>Clientes</h1>
          <p className={styles.lead}>Quem já agendou com você ({customers.length} no total).</p>
        </div>
      </div>

      <SegmentationConfig business={me.business} />
      <ClientesView customers={customers} businessName={me.business.name} />
    </div>
  );
}
