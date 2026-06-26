'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import styles from '../painel.module.css';

const LINKS = [
  { href: '/painel', label: 'Agenda', exact: true },
  { href: '/painel/relatorio', label: 'Faturamento' },
  { href: '/painel/servicos', label: 'Serviços' },
  { href: '/painel/profissionais', label: 'Profissionais' },
  { href: '/painel/bloqueios', label: 'Bloqueios' },
  { href: '/painel/negocio', label: 'Negócio' },
  { href: '/painel/aparencia', label: 'Aparência' },
  { href: '/painel/pagamentos', label: 'Pagamentos' },
  { href: '/painel/perfil', label: 'Perfil' },
];

export function Nav({ businessName, slug }: { businessName: string; slug: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function sair() {
    await fetch('/painel/api/logout', { method: 'POST' });
    router.replace('/painel/login');
    router.refresh();
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <div className={styles.brandName}>{businessName}</div>
        <div className={styles.brandMeta}>/{slug}</div>
      </div>

      <nav>
        {LINKS.map((l) => {
          const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`${styles.navlink} ${active ? styles.navlinkActive : ''}`}
            >
              <span className={styles.navDot} />
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.sidebarFoot}>
        <button className={styles.ghost} onClick={sair} type="button">
          Sair
        </button>
      </div>
    </aside>
  );
}
