'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import type { CustomerRow } from '@/lib/panel-api';
import { saveCustomerNote, type ActionState } from '../../actions';
import { maskFormat } from '../../MaskedInput';
import { SegmentTag } from './SegmentTag';
import { WhatsAppCallButton } from './WhatsAppCallButton';
import styles from '../../painel.module.css';
import { brl } from '@/lib/format';

const INIT: ActionState = { ok: false };

function lastLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function SaveNote() {
  const { pending } = useFormStatus();
  return (
    <button className={`${styles.smallBtn} ${styles.primarySmall}`} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar'}
    </button>
  );
}

function CustomerRowItem({ c, businessName }: { c: CustomerRow; businessName: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useFormState(saveCustomerNote, INIT);
  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state.ok]);

  return (
    <div className={styles.clientRow}>
      <div className={styles.clientHead}>
        <div className={styles.rowMain}>
          <div className={styles.rowName} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link href={`/painel/clientes/${c.id}`} className={styles.altLink}>{c.name ?? 'Sem nome'}</Link>
            <SegmentTag segment={c.segment} />
          </div>
          <div className={styles.rowMeta}>
            {maskFormat('phone', c.phone)}
            {c.email ? ` · ${c.email}` : ''}
          </div>
        </div>
        <div className={styles.rowActions} style={{ gap: 16 }}>
          <span className={styles.rowMeta}>{brl(c.totalSpentCents)} · {c.visits} visitas</span>
          <span className={styles.rowMeta}>último: {lastLabel(c.lastAt)}</span>
          <WhatsAppCallButton name={c.name} phone={c.phone} businessName={businessName} />
          <Link href={`/painel/clientes/${c.id}`} className={styles.smallBtn}>Ver ficha</Link>
          <button className={styles.smallBtn} type="button" onClick={() => setEditing((v) => !v)}>
            {c.ownerNote ? 'Editar nota' : 'Nota'}
          </button>
        </div>
      </div>

      {!editing && c.ownerNote && (
        <p className={styles.customerNote}>📝 {c.ownerNote}</p>
      )}

      {editing && (
        <form action={action} style={{ marginTop: 10 }}>
          <input type="hidden" name="id" value={c.id} />
          {state.error && <p className={styles.rowMeta} style={{ color: 'var(--danger)' }}>{state.error}</p>}
          <textarea
            className={styles.input}
            name="note"
            rows={2}
            maxLength={500}
            defaultValue={c.ownerNote ?? ''}
            placeholder="Observação privada (só você vê): preferências, alergias, etc."
          />
          <div className={styles.toolbar} style={{ gap: 8 }}>
            <button className={styles.smallBtn} type="button" onClick={() => setEditing(false)}>
              Cancelar
            </button>
            <SaveNote />
          </div>
        </form>
      )}
    </div>
  );
}

export function ClientesView({ customers, businessName }: { customers: CustomerRow[]; businessName: string }) {
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
            {customers.length === 0 ? 'Nenhum cliente ainda. Eles aparecem ao agendar.' : 'Nada encontrado.'}
          </p>
        ) : (
          filtered.map((c) => <CustomerRowItem key={c.id} c={c} businessName={businessName} />)
        )}
      </div>
    </>
  );
}
