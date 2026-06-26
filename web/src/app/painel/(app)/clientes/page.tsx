import { listCustomers } from '@/lib/panel-api';
import { ClientesView } from './ClientesView';
import styles from '../../painel.module.css';

export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  const customers = await listCustomers();

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Painel</p>
          <h1 className={styles.h1}>Clientes</h1>
          <p className={styles.lead}>Quem já agendou com você — {customers.length} no total.</p>
        </div>
      </div>

      <ClientesView customers={customers} />
    </div>
  );
}
