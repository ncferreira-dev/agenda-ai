'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createService, updateService, setServiceActive, type ActionState } from '../../actions';
import type { Service } from '@/lib/panel-api';
import styles from '../../painel.module.css';

const INIT: ActionState = { ok: false };

function reais(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={`${styles.smallBtn} ${styles.primarySmall}`} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : label}
    </button>
  );
}

function CreateForm() {
  const [state, action] = useFormState(createService, INIT);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className={`${styles.panel} ${styles.panelPad}`}>
      <h2 className={styles.sectionTitle}>Novo serviço</h2>
      {state.error && <p className={styles.error} style={{ marginTop: 12 }}>{state.error}</p>}
      <div className={`${styles.formRow} ${styles.gap}`}>
        <label className={styles.field}>
          <span className={styles.label}>Nome</span>
          <input className={styles.input} name="name" placeholder="Corte degradê" required />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Duração (min)</span>
          <input className={styles.input} name="durationMinutes" type="number" min={1} defaultValue={30} required />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Preço (R$)</span>
          <input className={styles.input} name="preco" inputMode="decimal" placeholder="40,00" />
        </label>
      </div>
      <div className={styles.toolbar}>
        <Submit label="Adicionar serviço" />
      </div>
    </form>
  );
}

function EditRow({ service, onDone }: { service: Service; onDone: () => void }) {
  const [state, action] = useFormState(updateService, INIT);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className={styles.row}>
      <input type="hidden" name="id" value={service.id} />
      <div className={`${styles.formRow}`} style={{ flex: 1 }}>
        <input className={styles.input} name="name" defaultValue={service.name} required />
        <input className={styles.input} name="durationMinutes" type="number" min={1} defaultValue={service.durationMinutes} required />
        <input className={styles.input} name="preco" inputMode="decimal" defaultValue={reais(service.priceCents)} />
      </div>
      <div className={styles.rowActions}>
        {state.error && <span className={styles.rowMeta} style={{ color: '#8f3417' }}>{state.error}</span>}
        <Submit label="Salvar" />
        <button className={styles.smallBtn} type="button" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function ServicesManager({ services }: { services: Service[] }) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <>
      <CreateForm />

      <div className={`${styles.panel} ${styles.gap}`}>
        {services.length === 0 ? (
          <p className={styles.empty}>Nenhum serviço ainda. Crie o primeiro acima.</p>
        ) : (
          services.map((s) =>
            editing === s.id ? (
              <EditRow key={s.id} service={s} onDone={() => setEditing(null)} />
            ) : (
              <div key={s.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowName}>
                    {s.name}
                    {!s.active && <span className={`${styles.chip} ${styles.chipOff}`}>inativo</span>}
                  </div>
                  <div className={styles.rowMeta}>
                    {s.durationMinutes} min · <span className={styles.price}>R$ {reais(s.priceCents)}</span>
                  </div>
                </div>
                <div className={styles.rowActions}>
                  <button className={styles.smallBtn} type="button" onClick={() => setEditing(s.id)}>
                    Editar
                  </button>
                  <form action={setServiceActive}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="active" value={(!s.active).toString()} />
                    <button className={`${styles.linkBtn} ${s.active ? styles.dangerBtn : ''}`} type="submit">
                      {s.active ? 'Desativar' : 'Reativar'}
                    </button>
                  </form>
                </div>
              </div>
            ),
          )
        )}
      </div>
    </>
  );
}
