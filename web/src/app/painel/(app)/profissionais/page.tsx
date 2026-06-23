import { getWorkingHours, listProfessionals, listServices, type WorkingHour } from '@/lib/panel-api';
import { ProfessionalsManager } from './ProfessionalsManager';
import styles from '../../painel.module.css';

export const dynamic = 'force-dynamic';

export default async function ProfissionaisPage() {
  const [professionals, services] = await Promise.all([listProfessionals(), listServices()]);

  // Pré-carrega a grade de cada profissional pro editor abrir instantâneo.
  const horas = await Promise.all(professionals.map((p) => getWorkingHours(p.id)));
  const hoursByPro: Record<string, WorkingHour[]> = {};
  professionals.forEach((p, i) => {
    hoursByPro[p.id] = horas[i];
  });

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Configuração</p>
          <h1 className={styles.h1}>Profissionais</h1>
          <p className={styles.lead}>Quem atende, o que faz e em quais horários trabalha.</p>
        </div>
      </div>

      <ProfessionalsManager professionals={professionals} services={services} hoursByPro={hoursByPro} />
    </div>
  );
}
