'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import styles from '../painel.module.css';

const LINKS = [
  { href: '/painel', label: 'Agenda', exact: true },
  { href: '/painel/relatorio', label: 'Faturamento' },
  { href: '/painel/divulgar', label: 'Divulgar' },
  { href: '/painel/servicos', label: 'Serviços' },
  { href: '/painel/profissionais', label: 'Profissionais' },
  { href: '/painel/clientes', label: 'Clientes' },
  { href: '/painel/bloqueios', label: 'Bloqueios' },
  { href: '/painel/negocio', label: 'Negócio' },
  { href: '/painel/aparencia', label: 'Aparência' },
  { href: '/painel/pagamentos', label: 'Pagamentos' },
  { href: '/painel/planos', label: 'Planos' },
  { href: '/painel/notificacoes', label: 'Notificações' },
  { href: '/painel/perfil', label: 'Perfil' },
];

// Wordmark da marca. Clicar volta pra home (Agenda/dashboard).
function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/painel" className={styles.logo} aria-label="agend.ai, início" onClick={onClick}>
      agend<span className={styles.logoDot}>.</span>ai
    </Link>
  );
}

export function Nav({ businessName, slug }: { businessName: string; slug: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Fecha o drawer ao trocar de rota (ex.: clicou numa aba).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Drawer aberto: trava o scroll do body e permite fechar com Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function sair() {
    await fetch('/painel/api/logout', { method: 'POST' });
    router.replace('/painel/login');
    router.refresh();
  }

  return (
    <>
      {/* Top bar — só aparece no mobile (CSS). */}
      <header className={styles.topbar}>
        <button
          className={styles.burger}
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          aria-controls="painel-nav"
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
        <Logo />
      </header>

      {/* Scrim do drawer (mobile). Tocar fora fecha. */}
      <div
        className={`${styles.scrim} ${open ? styles.scrimOpen : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar (desktop fixa) / drawer (mobile). */}
      <aside
        id="painel-nav"
        className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}
        aria-label="Navegação do painel"
      >
        <div className={styles.brand}>
          <div className={styles.brandTop}>
            <Logo onClick={() => setOpen(false)} />
            <button
              className={styles.drawerClose}
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
              type="button"
            >
              ✕
            </button>
          </div>
          <div className={styles.brandName}>{businessName}</div>
          <div className={styles.brandMeta}>/{slug}</div>
        </div>

        <nav className={styles.navList}>
          {LINKS.map((l) => {
            const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`${styles.navlink} ${active ? styles.navlinkActive : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setOpen(false)}
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
    </>
  );
}
