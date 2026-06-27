'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  createRecurringBlock,
  deleteRecurringBlock,
  type ActionState,
} from '../../actions';
import type { Professional, RecurringBlock } from '@/lib/panel-api';
import styles from '../../painel.module.css';

const INIT: ActionState = { ok: false };

// 0 = domingo … 6 = sábado (mesmo padrão do backend/Luxon convertido).
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function hhmm(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={`${styles.smallBtn} ${styles.primarySmall}`} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : label}
    </button>
  );
}

export function RecurringBlocksManager({
  blocks,
  professionals,
}: {
  blocks: RecurringBlock[];
  professionals: Professional[];
}) {
  const [state, action] = useFormState(createRecurringBlock, INIT);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  const nome = (id: string | null) =>
    id ? professionals.find((p) => p.id === id)?.name ?? 'profissional' : 'Negócio todo';

  return (
    <>
      <form ref={ref} action={action} className={`${styles.panel} ${styles.panelPad}`}>
        <h2 className={styles.sectionTitle}>Novo bloqueio recorrente</h2>
        <p className={styles.rowMeta} style={{ marginBottom: 6 }}>
          Repete toda semana — almoço fixo, folga semanal, dia fechado.
        </p>
        {state.error && <p className={styles.error} style={{ marginTop: 12 }}>{state.error}</p>}

        <div className={`${styles.formRow} ${styles.gap}`}>
          <label className={styles.field}>
            <span className={styles.label}>Dia da semana</span>
            <select className={styles.select} name="weekday" defaultValue="1">
              {DIAS.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Início</span>
            <input className={styles.input} name="start" type="time" required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Fim</span>
            <input className={styles.input} name="end" type="time" required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Quem</span>
            <select className={styles.select} name="professionalId" defaultValue="">
              <option value="">Negócio todo</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={styles.field}>
          <span className={styles.label}>Motivo (opcional)</span>
          <input className={styles.input} name="reason" placeholder="Almoço, folga semanal…" />
        </label>
        <div className={styles.toolbar}>
          <Submit label="Bloquear toda semana" />
        </div>
      </form>

      <div className={`${styles.panel} ${styles.gap}`}>
        {blocks.length === 0 ? (
          <p className={styles.empty}>Nenhum bloqueio recorrente. Use para folgas e intervalos fixos.</p>
        ) : (
          blocks.map((b) => (
            <div key={b.id} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowName}>
                  Toda {DIAS[b.weekday]} · {hhmm(b.startMinute)}–{hhmm(b.endMinute)}
                  <span className={styles.tag}>{nome(b.professionalId)}</span>
                </div>
                {b.reason && <div className={styles.rowMeta}>{b.reason}</div>}
              </div>
              <div className={styles.rowActions}>
                <form action={deleteRecurringBlock}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className={`${styles.linkBtn} ${styles.dangerBtn}`} type="submit">
                    Remover
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
