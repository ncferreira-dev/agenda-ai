import { getMe, listBlocks, listProfessionals } from '@/lib/panel-api';
import { BlocksManager } from './BlocksManager';
import styles from '../../painel.module.css';

export const dynamic = 'force-dynamic';

export default async function BloqueiosPage() {
  const [me, blocks, professionals] = await Promise.all([
    getMe(),
    listBlocks(),
    listProfessionals(),
  ]);
  if (!me) return null;

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Configuração</p>
          <h1 className={styles.h1}>Bloqueios</h1>
          <p className={styles.lead}>Tire horários da agenda sem mexer na grade fixa.</p>
        </div>
      </div>

      <BlocksManager
        blocks={blocks}
        professionals={professionals.filter((p) => p.active)}
        timezone={me.business.timezone}
      />
    </div>
  );
}
