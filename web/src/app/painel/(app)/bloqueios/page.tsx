import {
  getMe,
  listBlocks,
  listProfessionals,
  listRecurringBlocks,
} from '@/lib/panel-api';
import { BlocksManager } from './BlocksManager';
import { RecurringBlocksManager } from './RecurringBlocksManager';
import styles from '../../painel.module.css';

export const dynamic = 'force-dynamic';

export default async function BloqueiosPage() {
  const [me, blocks, recurring, professionals] = await Promise.all([
    getMe(),
    listBlocks(),
    listRecurringBlocks(),
    listProfessionals(),
  ]);
  if (!me) return null;

  const ativos = professionals.filter((p) => p.active);

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Configuração</p>
          <h1 className={styles.h1}>Bloqueios</h1>
          <p className={styles.lead}>Tire horários da agenda sem mexer na grade fixa.</p>
        </div>
      </div>

      <h2 className={styles.sectionTitle} style={{ marginTop: 8 }}>Pontuais</h2>
      <p className={styles.lead} style={{ marginTop: 0 }}>
        Uma data específica — folga, feriado, manutenção.
      </p>
      <BlocksManager
        blocks={blocks}
        professionals={ativos}
        timezone={me.business.timezone}
      />

      <h2 className={styles.sectionTitle} style={{ marginTop: 28 }}>Recorrentes</h2>
      <p className={styles.lead} style={{ marginTop: 0 }}>
        Repetem toda semana — almoço fixo, folga semanal, dia fechado.
      </p>
      <RecurringBlocksManager blocks={recurring} professionals={ativos} />
    </div>
  );
}
