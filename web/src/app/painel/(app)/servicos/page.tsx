import { getMe, listServices } from '@/lib/panel-api';
import { ServicesManager } from './ServicesManager';
import styles from '../../painel.module.css';

export const dynamic = 'force-dynamic';

export default async function ServicosPage() {
  const [services, me] = await Promise.all([listServices(), getMe()]);

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Configuração</p>
          <h1 className={styles.h1}>Serviços</h1>
          <p className={styles.lead}>O que você oferece, com duração e preço. Some na sua página pública.</p>
        </div>
      </div>

      <ServicesManager services={services} profession={me?.business.profession ?? null} />
    </div>
  );
}
