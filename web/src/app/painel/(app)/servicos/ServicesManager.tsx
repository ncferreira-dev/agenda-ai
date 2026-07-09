'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  createService,
  updateService,
  setServiceActive,
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

// Bloco de desconto (opcional): tipo (%, R$) + valor. Campos não controlados
// entram no submit do <form> pai; o backend valida (%: 1–99, R$: 1..preço).
function DiscountFields({
  defaultKind,
  defaultValue,
}: {
  defaultKind?: 'PERCENT' | 'FIXED' | null;
  defaultValue?: number;
}) {
  const [kind, setKind] = useState<string>(defaultKind ?? '');
  // FIXED chega em centavos -> mostra em reais; PERCENT chega como inteiro.
  const initialValue =
    defaultKind === 'FIXED'
      ? reais(defaultValue ?? 0)
      : defaultValue
        ? String(defaultValue)
        : '';

  return (
    <details className={styles.followUp} open={Boolean(defaultKind)}>
      <summary className={styles.followUpSummary}>Desconto (opcional)</summary>
      <p className={styles.rowMeta} style={{ margin: '6px 0 10px' }}>
        O cliente vê o preço cheio riscado e o preço com desconto na página.
      </p>
      <div className={`${styles.formRow} ${styles.gap}`}>
        <label className={styles.field} style={{ maxWidth: 220 }}>
          <span className={styles.label}>Tipo</span>
          <select
            className={styles.input}
            name="discountKind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">Sem desconto</option>
            <option value="PERCENT">Percentual (%)</option>
            <option value="FIXED">Valor fixo (R$)</option>
          </select>
        </label>
        {kind && (
          <label className={styles.field} style={{ maxWidth: 220 }}>
            <span className={styles.label}>{kind === 'PERCENT' ? 'Desconto (%)' : 'Desconto (R$)'}</span>
            <input
              className={styles.input}
              name="discountValue"
              inputMode="decimal"
              defaultValue={initialValue}
              placeholder={kind === 'PERCENT' ? 'ex.: 10' : 'ex.: 5,00'}
            />
          </label>
        )}
      </div>
    </details>
  );
}

// Bloco de kit (opcional): marca "montar como kit" e escolhe os serviços inclusos
// (mín. 2, do mesmo negócio, sem outros kits). A duração vira a soma deles.
function KitFields({
  candidates,
  defaultMembers,
  defaultIsKit,
}: {
  candidates: Service[];
  defaultMembers?: string[];
  defaultIsKit?: boolean;
}) {
  const [isKit, setIsKit] = useState(Boolean(defaultIsKit));
  const selected = new Set(defaultMembers ?? []);

  return (
    <details className={styles.followUp} open={isKit}>
      <summary className={styles.followUpSummary}>Kit / combo (opcional)</summary>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
        <input
          type="checkbox"
          name="isKit"
          checked={isKit}
          onChange={(e) => setIsKit(e.target.checked)}
        />
        <span>Montar este serviço como um kit</span>
      </label>
      {isKit && (
        <>
          <p className={styles.rowMeta} style={{ marginBottom: 10 }}>
            Marque os serviços inclusos (mín. 2). A duração é a soma deles; o preço é o que
            você definiu acima. Executado por um profissional só, num bloco único.
          </p>
          {candidates.length === 0 ? (
            <p className={styles.rowMeta}>Cadastre ao menos 2 serviços comuns antes de montar um kit.</p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {candidates.map((c) => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    name="kitMemberIds"
                    value={c.id}
                    defaultChecked={selected.has(c.id)}
                  />
                  <span>{c.name}</span>
                  <span className={styles.rowMeta}>· {c.durationMinutes} min · R$ {reais(c.priceCents)}</span>
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </details>
  );
}

// Bloco "Lembrete de retorno" reutilizado no criar e no editar.
// Campos não controlados (name=…) -> entram no submit do <form> pai e o reset()
// do form os limpa.
function FollowUpFields({
  defaultDays,
  defaultMessage,
  open,
}: {
  defaultDays?: number | null;
  defaultMessage?: string | null;
  open?: boolean;
}) {
  return (
    <details className={styles.followUp} open={open || Boolean(defaultDays)}>
      <summary className={styles.followUpSummary}>Lembrete de retorno (opcional)</summary>
      <p className={styles.rowMeta} style={{ margin: '6px 0 10px' }}>
        Convide o cliente a refazer depois de um tempo.
      </p>

      <div className={`${styles.formRow} ${styles.gap}`}>
        <label className={styles.field} style={{ maxWidth: 220 }}>
          <span className={styles.label}>Lembrar de refazer a cada (dias)</span>
          <input
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

function CreateForm({ candidates }: { candidates: Service[] }) {
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

      <DiscountFields />
      <KitFields candidates={candidates} />
      <FollowUpFields />

      <div className={styles.toolbar}>
        <Submit label="Adicionar serviço" />
      </div>
    </form>
  );
}

function EditRow({
  service,
  candidates,
  onDone,
}: {
  service: Service;
  candidates: Service[];
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
        {/* Kit: a duração é calculada (soma dos membros); não editável aqui. */}
        {!service.isKit && (
          <input className={styles.input} name="durationMinutes" type="number" min={1} defaultValue={service.durationMinutes} required />
        )}
        <input className={styles.input} name="preco" inputMode="decimal" defaultValue={reais(service.priceCents)} />
      </div>

      <DiscountFields defaultKind={service.discountKind} defaultValue={service.discountValue} />
      {service.isKit && (
        <KitFields
          candidates={candidates}
          defaultIsKit
          defaultMembers={service.kitItems.map((k) => k.memberServiceId)}
        />
      )}
      <FollowUpFields
        defaultDays={service.followUpDays}
        defaultMessage={service.followUpMessage}
      />

      <div className={styles.rowActions} style={{ marginTop: 10 }}>
        {state.error && <span className={styles.rowMeta} style={{ color: 'var(--danger)' }}>{state.error}</span>}
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
}: {
  services: Service[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  // Candidatos a membro de kit: serviços comuns e ativos (kits não aninham).
  const kitCandidates = services.filter((s) => !s.isKit && s.active);

  return (
    <>
      <CreateForm candidates={kitCandidates} />

      <div className={`${styles.panel} ${styles.gap}`}>
        {services.length === 0 ? (
          <p className={styles.empty}>Nenhum serviço ainda. Crie o primeiro acima.</p>
        ) : (
          services.map((s) =>
            editing === s.id ? (
              <EditRow
                key={s.id}
                service={s}
                candidates={kitCandidates.filter((c) => c.id !== s.id)}
                onDone={() => setEditing(null)}
              />
            ) : (
              <div key={s.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowName}>
                    {s.name}
                    {s.isKit && <span className={styles.tag}>kit</span>}
                    {!s.active && <span className={`${styles.chip} ${styles.chipOff}`}>inativo</span>}
                    {s.discountKind && (
                      <span className={styles.tag}>
                        {s.discountKind === 'PERCENT' ? `-${s.discountValue}%` : `-R$ ${reais(s.discountValue)}`}
                      </span>
                    )}
                    {s.followUpDays && (
                      <span className={styles.tag}>retorno {s.followUpDays}d</span>
                    )}
                  </div>
                  <div className={styles.rowMeta}>
                    {s.durationMinutes} min · <span className={styles.price}>R$ {reais(s.priceCents)}</span>
                    {s.isKit && s.kitItems.length > 0 && (
                      <> · inclui {s.kitItems.map((k) => k.member.name).join(' + ')}</>
                    )}
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
