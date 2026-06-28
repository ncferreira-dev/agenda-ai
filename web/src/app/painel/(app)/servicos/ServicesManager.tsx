'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  createService,
  updateService,
  setServiceActive,
  suggestFollowUp,
  type ActionState,
} from '../../actions';
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

// Bloco "Lembrete de retorno" reutilizado no criar e no editar.
// Campos não controlados (name=…) -> entram no submit do <form> pai e o reset()
// do form os limpa. O botão "Sugerir com IA" preenche via ref.
function FollowUpFields({
  profession,
  getDescription,
  defaultDays,
  defaultMessage,
  open,
}: {
  profession: string | null;
  getDescription: () => string;
  defaultDays?: number | null;
  defaultMessage?: string | null;
  open?: boolean;
}) {
  const daysRef = useRef<HTMLInputElement>(null);
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  async function suggest() {
    const description = getDescription().trim();
    if (!description) {
      setHint('Escreva o nome do serviço primeiro.');
      return;
    }
    setBusy(true);
    setHint(null);
    try {
      const r = await suggestFollowUp({ description, profession });
      if (r.ok) {
        if (daysRef.current && r.followUpDays != null) daysRef.current.value = String(r.followUpDays);
        if (msgRef.current && r.message) msgRef.current.value = r.message;
        setHint(r.source === 'ai' ? 'Sugerido por IA ✨' : 'Sugestão pronta ✨');
      } else {
        setHint(r.error ?? 'Não consegui sugerir.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className={styles.followUp} open={open || Boolean(defaultDays)}>
      <summary className={styles.followUpSummary}>Lembrete de retorno (opcional)</summary>
      <p className={styles.rowMeta} style={{ margin: '6px 0 10px' }}>
        Convide o cliente a refazer depois de um tempo. Descreva o serviço e deixe a IA sugerir.
      </p>

      <div className={styles.toolbar} style={{ justifyContent: 'flex-start', marginBottom: 10 }}>
        <button
          type="button"
          className={`${styles.smallBtn}`}
          onClick={suggest}
          disabled={busy}
        >
          {busy ? 'Pensando…' : 'Sugerir com IA ✨'}
        </button>
        {hint && <span className={styles.rowMeta}>{hint}</span>}
      </div>

      <div className={`${styles.formRow} ${styles.gap}`}>
        <label className={styles.field} style={{ maxWidth: 220 }}>
          <span className={styles.label}>Lembrar de refazer a cada (dias)</span>
          <input
            ref={daysRef}
            className={styles.input}
            name="followUpDays"
            type="number"
            min={1}
            max={365}
            placeholder="ex.: 30"
            defaultValue={defaultDays ?? ''}
          />
        </label>
      </div>
      <label className={styles.field} style={{ marginTop: 10 }}>
        <span className={styles.label}>Mensagem de retorno</span>
        <textarea
          ref={msgRef}
          className={styles.input}
          name="followUpMessage"
          rows={3}
          placeholder="Oi {nome}! Já faz um tempinho do seu {servico} na {negocio}…"
          defaultValue={defaultMessage ?? ''}
        />
        <span className={styles.rowMeta} style={{ marginTop: 4 }}>
          Use {'{nome}'}, {'{servico}'} e {'{negocio}'}. São trocados na hora do envio.
        </span>
      </label>
    </details>
  );
}

function CreateForm({ profession }: { profession: string | null }) {
  const [state, action] = useFormState(createService, INIT);
  const ref = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
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
          <input ref={nameRef} className={styles.input} name="name" placeholder="Corte degradê" required />
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

      <FollowUpFields profession={profession} getDescription={() => nameRef.current?.value ?? ''} />

      <div className={styles.toolbar}>
        <Submit label="Adicionar serviço" />
      </div>
    </form>
  );
}

function EditRow({
  service,
  profession,
  onDone,
}: {
  service: Service;
  profession: string | null;
  onDone: () => void;
}) {
  const [state, action] = useFormState(updateService, INIT);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className={styles.row} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <input type="hidden" name="id" value={service.id} />
      <div className={`${styles.formRow} ${styles.gap}`} style={{ width: '100%' }}>
        <input ref={nameRef} className={styles.input} name="name" defaultValue={service.name} required />
        <input className={styles.input} name="durationMinutes" type="number" min={1} defaultValue={service.durationMinutes} required />
        <input className={styles.input} name="preco" inputMode="decimal" defaultValue={reais(service.priceCents)} />
      </div>

      <FollowUpFields
        profession={profession}
        getDescription={() => nameRef.current?.value ?? service.name}
        defaultDays={service.followUpDays}
        defaultMessage={service.followUpMessage}
      />

      <div className={styles.rowActions} style={{ marginTop: 10 }}>
        {state.error && <span className={styles.rowMeta} style={{ color: '#8f3417' }}>{state.error}</span>}
        <Submit label="Salvar" />
        <button className={styles.smallBtn} type="button" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function ServicesManager({
  services,
  profession,
}: {
  services: Service[];
  profession: string | null;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <>
      <CreateForm profession={profession} />

      <div className={`${styles.panel} ${styles.gap}`}>
        {services.length === 0 ? (
          <p className={styles.empty}>Nenhum serviço ainda. Crie o primeiro acima.</p>
        ) : (
          services.map((s) =>
            editing === s.id ? (
              <EditRow key={s.id} service={s} profession={profession} onDone={() => setEditing(null)} />
            ) : (
              <div key={s.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowName}>
                    {s.name}
                    {!s.active && <span className={`${styles.chip} ${styles.chipOff}`}>inativo</span>}
                    {s.followUpDays && (
                      <span className={styles.tag}>retorno {s.followUpDays}d</span>
                    )}
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
