import { redirect } from 'next/navigation';
import { getMe } from '@/lib/panel-api';
import { LogoutButton } from './LogoutButton';
import styles from './painel.module.css';

// Dashboard (stub da Etapa 2): prova que a sessão httpOnly funciona ponta a
// ponta. As telas de CRUD/agenda entram na Etapa 3.
export default async function PainelHome() {
  const me = await getMe();
  if (!me) redirect('/painel/login');

  const linkAgenda = `/${me.business.slug}`;

  return (
    <main className={styles.shell}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.title}>{me.business.name}</h1>
          <p className={styles.muted}>Logado como {me.owner.email}</p>
        </div>
        <LogoutButton />
      </div>

      <div className={styles.linkBox}>
        <p className={styles.muted}>Link público da sua agenda</p>
        <a href={linkAgenda} style={{ color: 'var(--accent)', fontWeight: 600 }}>
          {linkAgenda}
        </a>
      </div>

      <p className={styles.muted} style={{ marginTop: 24 }}>
        Em breve aqui: agenda do dia, serviços, profissionais e bloqueios (Etapa 3).
      </p>
    </main>
  );
}
