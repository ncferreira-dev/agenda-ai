'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveAppointmentItems, type ActionState } from '../actions';
import type { Appointment } from '@/lib/panel-api';
import styles from '../painel.module.css';

const INIT: ActionState = { ok: false };

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <button className={`${styles.smallBtn} ${styles.primarySmall}`} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar itens'}
    </button>
  );
}

type Linha = { name: string; preco: string }; // preco em reais (string do input)

export function ItemsEditor({ appointment: a }: { appointment: Appointment }) {
  const [state, action] = useFormState(saveAppointmentItems, INIT);
  const [editing, setEditing] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>(
    a.items.map((it) => ({ name: it.name, preco: (it.priceCents / 100).toFixed(2) })),
  );

  // Fecha o editor quando o save dá certo (a página revalida com o novo total).
  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state.ok]);

  // Pago: total congela, sem edição (não reescreve histórico financeiro).
  if (a.paid && !editing) {
    return (
      <div className={styles.rowMeta} style={{ marginTop: 4 }}>
        Total {brl(a.totalCents)} · <span style={{ opacity: 0.7 }}>itens travados (pago)</span>
      </div>
    );
  }

  if (!editing) {
    const resumo = a.items.length > 1 ? ` · ${a.items.length} itens` : '';
    return (
      <div className={styles.rowMeta} style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>Total {brl(a.totalCents)}{resumo}</span>
        <button
          type="button"
          className={styles.linkBtn}
          onClick={() => {
            setLinhas(a.items.map((it) => ({ name: it.name, preco: (it.priceCents / 100).toFixed(2) })));
            setEditing(true);
          }}
        >
          Editar
        </button>
      </div>
    );
  }

  const totalCents = linhas.reduce((s, l) => s + Math.round((Number(l.preco.replace(',', '.')) || 0) * 100), 0);
  const itemsJson = JSON.stringify(
    linhas
      .map((l) => ({ name: l.name.trim(), priceCents: Math.round((Number(l.preco.replace(',', '.')) || 0) * 100) }))
      .filter((it) => it.name),
  );

  const set = (i: number, patch: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => setLinhas((ls) => ls.filter((_, idx) => idx !== i));
  const add = () => setLinhas((ls) => [...ls, { name: '', preco: '0,00' }]);

  return (
    <form action={action} className={`${styles.panel} ${styles.panelPad}`} style={{ marginTop: 8 }}>
      <input type="hidden" name="id" value={a.id} />
      <input type="hidden" name="items" value={itemsJson} />

      <span className={styles.label}>Itens cobrados</span>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        {linhas.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className={styles.input}
              value={l.name}
              placeholder="Item (ex.: Barba)"
              maxLength={80}
              onChange={(e) => set(i, { name: e.target.value })}
              style={{ flex: 1, minWidth: 0 }}
            />
            <input
              className={styles.input}
              value={l.preco}
              inputMode="decimal"
              onChange={(e) => set(i, { preco: e.target.value })}
              style={{ width: 90 }}
              aria-label="Preço em reais"
            />
            <button
              type="button"
              className={`${styles.linkBtn} ${styles.dangerBtn}`}
              onClick={() => remove(i)}
              disabled={linhas.length <= 1}
              title={linhas.length <= 1 ? 'Precisa de ao menos um item' : 'Remover'}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button type="button" className={styles.linkBtn} onClick={add} style={{ marginTop: 8 }}>
        + Adicionar item
      </button>

      {state.error && <p className={styles.error}>{state.error}</p>}

      <div className={styles.toolbar} style={{ gap: 10, alignItems: 'center', marginTop: 12 }}>
        <span className={styles.rowMeta} style={{ flex: 1 }}>Total {brl(totalCents)}</span>
        <button type="button" className={styles.linkBtn} onClick={() => setEditing(false)}>
          Cancelar
        </button>
        <Save />
      </div>
    </form>
  );
}
