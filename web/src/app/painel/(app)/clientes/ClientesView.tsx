'use client';

import { useMemo, useState } from 'react';
import type { CustomerRow } from '@/lib/panel-api';
import { maskFormat } from '../../MaskedInput';
import styles from '../../painel.module.css';

function lastLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function ClientesView({ customers }: { customers: CustomerRow[] }) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return customers;
    const digits = t.replace(/\D/g, '');
    return customers.filter(
      (c) =>
        (c.name ?? '').toLowerCase().includes(t) ||
        (c.email ?? '').toLowerCase().includes(t) ||
        (digits && c.phone.includes(digits)),
    );
  }, [q, customers]);

  return (
    <>
      <input
        className={styles.input}
        placeholder="Buscar por nome, telefone ou email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 16 }}
      />

      <div className={styles.panel}>
        {filtered.length === 0 ? (
          <p className={styles.empty}>
            {customers.length === 0 ? 'Nenhum cliente ainda — eles aparecem ao agendar.' : 'Nada encontrado.'}
          </p>
        ) : (
          filtered.map((c) => (
            <div key={c.id} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowName}>{c.name ?? 'Sem nome'}</div>
                <div className={styles.rowMeta}>
                  {maskFormat('phone', c.phone)}
                  {c.email ? ` · ${c.email}` : ''}
                </div>
              </div>
              <div className={styles.rowActions} style={{ gap: 16 }}>
                <span className={styles.rowMeta}>{c.totalAppointments} agend.</span>
                <span className={styles.rowMeta}>último: {lastLabel(c.lastAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
