'use client';

import { useRouter } from 'next/navigation';
import styles from './painel.module.css';

export function LogoutButton() {
  const router = useRouter();

  async function sair() {
    await fetch('/painel/api/logout', { method: 'POST' });
    router.replace('/painel/login');
    router.refresh();
  }

  return (
    <button className={styles.ghost} onClick={sair} type="button">
      Sair
    </button>
  );
}
