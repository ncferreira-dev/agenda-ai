import { getMe } from '@/lib/panel-api';
import { AppearanceForm } from './AppearanceForm';
import { CopyLink } from '../CopyLink';
import styles from '../../painel.module.css';

export const dynamic = 'force-dynamic';

export default async function AparenciaPage() {
  const me = await getMe();
  if (!me) return null;

  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:3001';

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Configuração</p>
          <h1 className={styles.h1}>Aparência</h1>
          <p className={styles.lead}>A cara do seu negócio na página pública: cor, logo, capa e texto.</p>
        </div>
      </div>

      <CopyLink url={`${origin}/${me.business.slug}`} />

      <div className={styles.gap}>
        <AppearanceForm business={me.business} />
      </div>
    </div>
  );
}
