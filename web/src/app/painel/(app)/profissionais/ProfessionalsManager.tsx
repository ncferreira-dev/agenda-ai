'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  createProfessional,
  updateProfessional,
  setProfessionalActive,
  type ActionState,
} from '../../actions';
import type { Professional, Service, WorkingHour } from '@/lib/panel-api';
import { HoursEditor } from './HoursEditor';
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

function proInitials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

// Foto (aparece pro cliente) + telefone + CPF. Usado no criar e no editar.
function IdentityFields({ pro }: { pro?: Professional }) {
  const [preview, setPreview] = useState<string | null>(pro?.photoUrl ?? null);
  return (
    <>
      <label className={styles.field}>
        <span className={styles.label}>Foto (aparece pro cliente)</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.thumbLogo} src={preview} alt="" style={{ margin: 0 }} />
          ) : (
            <span className={styles.proAvatarBig}>{pro ? proInitials(pro.name) : '+'}</span>
          )}
          <input
            className={styles.file}
            type="file"
            name="photo"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setPreview(URL.createObjectURL(f));
            }}
          />
        </div>
      </label>
      <div className={styles.formRow}>
        <label className={styles.field}>
          <span className={styles.label}>Telefone</span>
          <input className={styles.input} name="phone" defaultValue={pro?.phone ?? ''} placeholder="(11) 99999-9999" inputMode="tel" />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>CPF</span>
          <input className={styles.input} name="cpf" defaultValue={pro?.cpf ?? ''} placeholder="000.000.000-00" inputMode="numeric" />
        </label>
      </div>
    </>
  );
}

function ServiceChecks({ services, selected }: { services: Service[]; selected: string[] }) {
  return (
    <div className={styles.checks}>
      {services.map((s) => (
        <label key={s.id} className={styles.check}>
          <input type="checkbox" name="serviceIds" value={s.id} defaultChecked={selected.includes(s.id)} />
          {s.name}
        </label>
      ))}
    </div>
  );
}

function CreateForm({ services }: { services: Service[] }) {
  const [state, action] = useFormState(createProfessional, INIT);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className={`${styles.panel} ${styles.panelPad}`}>
      <h2 className={styles.sectionTitle}>Novo profissional</h2>
      {state.error && <p className={styles.error} style={{ marginTop: 12 }}>{state.error}</p>}
      <label className={`${styles.field} ${styles.gap}`}>
        <span className={styles.label}>Nome</span>
        <input className={styles.input} name="name" placeholder="João" required />
      </label>
      <IdentityFields />
      {services.length > 0 && (
        <label className={styles.field}>
          <span className={styles.label}>Faz quais serviços</span>
          <ServiceChecks services={services} selected={[]} />
        </label>
      )}
      <div className={styles.toolbar}>
        <Submit label="Adicionar profissional" />
      </div>
    </form>
  );
}

function EditForm({
  pro,
  services,
  onDone,
}: {
  pro: Professional;
  services: Service[];
  onDone: () => void;
}) {
  const [state, action] = useFormState(updateProfessional, INIT);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className={styles.panelPad} style={{ borderTop: '1px solid var(--line)' }}>
      <input type="hidden" name="id" value={pro.id} />
      {state.error && <p className={styles.error}>{state.error}</p>}
      <label className={styles.field}>
        <span className={styles.label}>Nome</span>
        <input className={styles.input} name="name" defaultValue={pro.name} required />
      </label>
      <IdentityFields pro={pro} />
      <label className={styles.field}>
        <span className={styles.label}>Faz quais serviços</span>
        <ServiceChecks services={services} selected={pro.serviceIds} />
      </label>
      <div className={styles.toolbar} style={{ gap: 8 }}>
        <button className={styles.smallBtn} type="button" onClick={onDone}>
          Cancelar
        </button>
        <Submit label="Salvar" />
      </div>
    </form>
  );
}

export function ProfessionalsManager({
  professionals,
  services,
  hoursByPro,
}: {
  professionals: Professional[];
  services: Service[];
  hoursByPro: Record<string, WorkingHour[]>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [hoursFor, setHoursFor] = useState<string | null>(null);

  const activeServices = services.filter((s) => s.active);
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? '—';

  return (
    <>
      <CreateForm services={activeServices} />

      <div className={`${styles.gap}`} style={{ display: 'grid', gap: 14 }}>
        {professionals.length === 0 ? (
          <div className={styles.panel}>
            <p className={styles.empty}>Nenhum profissional ainda. Crie o primeiro acima.</p>
          </div>
        ) : (
          professionals.map((p) => (
            <div key={p.id} className={styles.panel}>
              <div className={styles.row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  {p.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.proAvatar} src={p.photoUrl} alt="" />
                  ) : (
                    <span className={`${styles.proAvatar} ${styles.proAvatarText}`}>{proInitials(p.name)}</span>
                  )}
                  <div className={styles.rowMain}>
                    <div className={styles.rowName}>
                      {p.name}
                      {!p.active && <span className={`${styles.chip} ${styles.chipOff}`}>inativo</span>}
                    </div>
                    <div className={styles.rowMeta}>
                      {p.serviceIds.length
                        ? p.serviceIds.map((id) => <span key={id} className={styles.tag} style={{ marginRight: 6 }}>{serviceName(id)}</span>)
                        : 'sem serviços vinculados'}
                    </div>
                  </div>
                </div>
                <div className={styles.rowActions}>
                  <button className={styles.smallBtn} type="button" onClick={() => setHoursFor(hoursFor === p.id ? null : p.id)}>
                    {hoursFor === p.id ? 'Fechar horários' : 'Horários'}
                  </button>
                  <button className={styles.smallBtn} type="button" onClick={() => setEditing(editing === p.id ? null : p.id)}>
                    Editar
                  </button>
                  <form action={setProfessionalActive}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="active" value={(!p.active).toString()} />
                    <button className={`${styles.linkBtn} ${p.active ? styles.dangerBtn : ''}`} type="submit">
                      {p.active ? 'Desativar' : 'Reativar'}
                    </button>
                  </form>
                </div>
              </div>

              {editing === p.id && (
                <EditForm pro={p} services={activeServices} onDone={() => setEditing(null)} />
              )}

              {hoursFor === p.id && (
                <div className={styles.panelPad} style={{ paddingTop: 0 }}>
                  <HoursEditor
                    professionalId={p.id}
                    initial={hoursByPro[p.id] ?? []}
                    onClose={() => setHoursFor(null)}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
