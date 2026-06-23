import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/panel-api';
import { Nav } from './Nav';
import styles from '../painel.module.css';

// Layout das telas autenticadas. Confere a sessão (token pode ter expirado) e
// monta a navegação. O middleware já barra quem não tem cookie.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/painel/login');

  return (
    <div className={styles.shell}>
      <Nav businessName={me.business.name} slug={me.business.slug} />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
