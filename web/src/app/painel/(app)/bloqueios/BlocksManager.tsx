'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { DateTime } from 'luxon';
import { createBlock, deleteBlock, type ActionState } from '../../actions';
import type { Block, Professional } from '@/lib/panel-api';
import styles from '../../painel.module.css';

const INIT: ActionState = { ok: false };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={`${styles.smallBtn} ${styles.primarySmall}`} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : label}
    </button>
  );
}

export function BlocksManager({
  blocks,
  professionals,
  timezone,
}: {
  blocks: Block[];
  professionals: Professional[];
  timezone: string;
}) {
  const [state, action] = useFormState(createBlock, INIT);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  const nome = (id: string | null) =>
    id ? professionals.find((p) => p.id === id)?.name ?? 'profissional' : 'Negócio todo';

  return (
    <>
      <form ref={ref} action={action} className={`${styles.panel} ${styles.panelPad}`}>
        <h2 className={styles.sectionTitle}>Novo bloqueio</h2>
        <p className={styles.rowMeta} style={{ marginBottom: 6 }}>
          Folga, almoço extra, feriado: esse intervalo some da agenda.
        </p>
        {state.error && <p className={styles.error} style={{ marginTop: 12 }}>{state.error}</p>}

        <input type="hidden" name="timezone" value={timezone} />
        <div className={`${styles.formRow} ${styles.gap}`}>
          <label className={styles.field}>
            <span className={styles.label}>Dia</span>
            <input className={styles.input} name="date" type="date" required />
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
          <input className={styles.input} name="reason" placeholder="Feriado, manutenção…" />
        </label>
        <div className={styles.toolbar}>
          <Submit label="Bloquear horário" />
        </div>
      </form>

      <div className={`${styles.panel} ${styles.gap}`}>
        {blocks.length === 0 ? (
          <p className={styles.empty}>Nenhum bloqueio. Tudo liberado conforme a grade de horários.</p>
        ) : (
          blocks.map((b) => {
            const ini = DateTime.fromISO(b.startAt).setZone(timezone).setLocale('pt-BR');
            const fim = DateTime.fromISO(b.endAt).setZone(timezone);
            return (
              <div key={b.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowName}>
                    {ini.toFormat("ccc, dd/LL")} · {ini.toFormat('HH:mm')}–{fim.toFormat('HH:mm')}
                    <span className={styles.tag}>{nome(b.professionalId)}</span>
                  </div>
                  {b.reason && <div className={styles.rowMeta}>{b.reason}</div>}
                </div>
                <div className={styles.rowActions}>
                  <form action={deleteBlock}>
                    <input type="hidden" name="id" value={b.id} />
                    <button className={`${styles.linkBtn} ${styles.dangerBtn}`} type="submit">
                      Remover
                    </button>
                  </form>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
