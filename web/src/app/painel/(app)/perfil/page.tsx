import { getMe } from '@/lib/panel-api';
import { ProfileForm } from './ProfileForm';
import { PasswordForm } from './PasswordForm';
import styles from '../../painel.module.css';

export const dynamic = 'force-dynamic';

export default async function PerfilPage() {
  const me = await getMe();
  if (!me) return null;

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Conta</p>
          <h1 className={styles.h1}>Meu perfil</h1>
          <p className={styles.lead}>Seus dados de dono. O email é o seu login.</p>
        </div>
      </div>

      <ProfileForm owner={me.owner} />

      <div style={{ height: 18 }} />
      <PasswordForm owner={me.owner} />
    </div>
  );
}
