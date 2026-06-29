'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { Me } from '@/lib/panel-api';
import { saveSegmentation, type ActionState } from '../../actions';
import styles from '../../painel.module.css';

const INIT: ActionState = { ok: false };

function Save() {
  const { pending } = useFormStatus();
  return (
    <button className={`${styles.smallBtn} ${styles.primarySmall}`} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar regras'}
    </button>
  );
}

export function SegmentationConfig({ business }: { business: Me['business'] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(saveSegmentation, INIT);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (state.ok) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 2200);
      return () => clearTimeout(t);
    }
  }, [state.ok]);

  if (!open) {
    return (
      <button type="button" className={styles.linkBtn} onClick={() => setOpen(true)} style={{ marginBottom: 14 }}>
        ⚙ Regras de segmentação
      </button>
    );
  }

  return (
    <form action={action} className={`${styles.panel} ${styles.panelPad}`} style={{ marginBottom: 14 }}>
      <h2 className={styles.sectionTitle}>Regras de segmentação</h2>
      <p className={styles.rowMeta} style={{ marginBottom: 12 }}>
        Define quando um cliente vira Recorrente, VIP ou aparece como Sumido.
      </p>

      <div className={styles.formRow}>
        <label className={styles.field}>
          <span className={styles.label}>“Sumido” após (dias sem vir)</span>
          <input className={styles.input} name="inactiveDays" type="number" min={7} max={730} defaultValue={business.inactiveDays} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>“Recorrente” a partir de (visitas)</span>
          <input className={styles.input} name="recurringMinVisits" type="number" min={2} max={100} defaultValue={business.recurringMinVisits} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>“VIP” ao gastar (R$, opcional)</span>
          <input
            className={styles.input}
            name="vipMinSpent"
            inputMode="decimal"
            placeholder="ex.: 500"
            defaultValue={business.vipMinSpentCents != null ? (business.vipMinSpentCents / 100).toFixed(2) : ''}
          />
        </label>
      </div>

      {state.error && <p className={styles.error}>{state.error}</p>}

      <div className={styles.toolbar} style={{ gap: 10, alignItems: 'center', marginTop: 12 }}>
        {saved && <span className={`${styles.chip} ${styles.chipOk}`}>salvo ✓</span>}
        <button type="button" className={styles.linkBtn} onClick={() => setOpen(false)}>Fechar</button>
        <Save />
      </div>
    </form>
  );
}
