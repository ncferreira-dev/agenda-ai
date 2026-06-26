import { getMe } from '@/lib/panel-api';
import { DivulgarView } from './DivulgarView';
import styles from '../../painel.module.css';

export const dynamic = 'force-dynamic';

export default async function DivulgarPage() {
  const me = await getMe();
  if (!me) return null;
  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:3001';

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Crescer</p>
          <h1 className={styles.h1}>Divulgar</h1>
          <p className={styles.lead}>Seu link e QR code pra clientes agendarem sozinhos.</p>
        </div>
      </div>

      <DivulgarView url={`${origin}/${me.business.slug}`} businessName={me.business.name} />
    </div>
  );
}
