'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { savePayments, type ActionState } from '../../actions';
import type { Me } from '@/lib/panel-api';
import styles from '../../painel.module.css';

const INIT: ActionState = { ok: false };

function reais(cents: number | null): string {
  if (!cents) return '';
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <button className={`${styles.smallBtn} ${styles.primarySmall}`} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar'}
    </button>
  );
}

export function PaymentsForm({ business }: { business: Me['business'] }) {
  const [state, action] = useFormState(savePayments, INIT);
  const [on, setOn] = useState(business.requireDeposit);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (state.ok) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 2200);
      return () => clearTimeout(t);
    }
  }, [state.ok]);

  return (
    <form action={action} className={`${styles.panel} ${styles.panelPad}`}>
      {state.error && <p className={styles.error}>{state.error}</p>}

      <label className={styles.switchRow}>
        <input
          type="checkbox"
          name="requireDeposit"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
        />
        <span>
          <span className={styles.switchTitle}>Exigir sinal pra confirmar</span>
          <span className={styles.switchHint}>
            O horário só fica reservado depois que o cliente paga o sinal (cai no-show).
          </span>
        </span>
      </label>

      {on && (
        <label className={`${styles.field} ${styles.gap}`} style={{ maxWidth: 220 }}>
          <span className={styles.label}>Valor do sinal (R$)</span>
          <input
            className={styles.input}
            name="valor"
            inputMode="decimal"
            defaultValue={reais(business.depositCents)}
            placeholder="20,00"
          />
        </label>
      )}

      <div className={styles.toolbar} style={{ gap: 10, alignItems: 'center' }}>
        {saved && <span className={`${styles.chip} ${styles.chipOk}`}>salvo ✓</span>}
        <Save />
      </div>
    </form>
  );
}
