'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveWorkingHours, type ActionState } from '../../actions';
import type { WorkingHour } from '@/lib/panel-api';
import styles from '../../painel.module.css';

const INIT: ActionState = { ok: false };

// Ordem de exibição: segunda a domingo (weekday 0 = domingo).
const DIAS: { wd: number; nome: string }[] = [
  { wd: 1, nome: 'Segunda' },
  { wd: 2, nome: 'Terça' },
  { wd: 3, nome: 'Quarta' },
  { wd: 4, nome: 'Quinta' },
  { wd: 5, nome: 'Sexta' },
  { wd: 6, nome: 'Sábado' },
  { wd: 0, nome: 'Domingo' },
];

interface Range {
  start: string; // HH:mm
  end: string;
}

const toHHmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

function Save() {
  const { pending } = useFormStatus();
  return (
    <button className={`${styles.smallBtn} ${styles.primarySmall}`} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar grade'}
    </button>
  );
}

export function HoursEditor({
  professionalId,
  initial,
  onClose,
}: {
  professionalId: string;
  initial: WorkingHour[];
  onClose: () => void;
}) {
  const [state, action] = useFormState(saveWorkingHours, INIT);

  // Estado: faixas por dia, semeado a partir do que veio do banco.
  const [byDay, setByDay] = useState<Record<number, Range[]>>(() => {
    const m: Record<number, Range[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const w of initial) {
      (m[w.weekday] ??= []).push({ start: toHHmm(w.startMinute), end: toHHmm(w.endMinute) });
    }
    return m;
  });

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  const faixas = useMemo(() => {
    const out: { weekday: number; startMinute: number; endMinute: number }[] = [];
    for (const wd of Object.keys(byDay).map(Number)) {
      for (const r of byDay[wd]) {
        if (r.start && r.end) out.push({ weekday: wd, startMinute: toMin(r.start), endMinute: toMin(r.end) });
      }
    }
    return out;
  }, [byDay]);

  function addRange(wd: number) {
    setByDay((p) => ({ ...p, [wd]: [...p[wd], { start: '09:00', end: '12:00' }] }));
  }
  function setRange(wd: number, i: number, field: keyof Range, value: string) {
    setByDay((p) => ({ ...p, [wd]: p[wd].map((r, j) => (j === i ? { ...r, [field]: value } : r)) }));
  }
  function removeRange(wd: number, i: number) {
    setByDay((p) => ({ ...p, [wd]: p[wd].filter((_, j) => j !== i) }));
  }

  return (
    <form action={action} className={styles.hoursModal}>
      <input type="hidden" name="professionalId" value={professionalId} />
      <input type="hidden" name="faixas" value={JSON.stringify(faixas)} />

      {state.error && <p className={styles.error}>{state.error}</p>}

      {DIAS.map(({ wd, nome }) => (
        <div key={wd} className={styles.weekday}>
          <div className={styles.weekdayName}>{nome}</div>
          <div className={styles.ranges}>
            {byDay[wd].length === 0 && <span className={styles.closed}>Fechado</span>}
            {byDay[wd].map((r, i) => (
              <div key={i} className={styles.range}>
                <input
                  className={styles.timeInput}
                  type="time"
                  value={r.start}
                  onChange={(e) => setRange(wd, i, 'start', e.target.value)}
                />
                <span className={styles.dash}>até</span>
                <input
                  className={styles.timeInput}
                  type="time"
                  value={r.end}
                  onChange={(e) => setRange(wd, i, 'end', e.target.value)}
                />
                <button className={styles.xBtn} type="button" onClick={() => removeRange(wd, i)} aria-label="remover faixa">
                  ×
                </button>
              </div>
            ))}
            <button className={styles.addRange} type="button" onClick={() => addRange(wd)}>
              + faixa
            </button>
          </div>
        </div>
      ))}

      <div className={styles.toolbar} style={{ gap: 8 }}>
        <button className={styles.smallBtn} type="button" onClick={onClose}>
          Cancelar
        </button>
        <Save />
      </div>
    </form>
  );
}
