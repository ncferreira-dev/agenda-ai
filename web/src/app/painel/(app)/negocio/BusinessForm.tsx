'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveBusiness, type ActionState } from '../../actions';
import { MaskedInput } from '../../MaskedInput';
import type { Me } from '@/lib/panel-api';
import styles from '../../painel.module.css';

const INIT: ActionState = { ok: false };

type Mode = 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO';
const MODES: { id: Mode; emoji: string; label: string; desc: string }[] = [
  { id: 'PRESENCIAL', emoji: '🏠', label: 'Presencial', desc: 'O cliente vai até o seu local' },
  { id: 'REMOTO', emoji: '💻', label: 'Remoto', desc: 'Atendimento online' },
  { id: 'HIBRIDO', emoji: '🔀', label: 'Híbrido', desc: 'Presencial e online' },
];

const TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/Sao_Paulo', label: 'São Paulo / Brasília (GMT-3)' },
  { value: 'America/Bahia', label: 'Bahia (GMT-3)' },
  { value: 'America/Fortaleza', label: 'Fortaleza (GMT-3)' },
  { value: 'America/Recife', label: 'Recife (GMT-3)' },
  { value: 'America/Belem', label: 'Belém (GMT-3)' },
  { value: 'America/Campo_Grande', label: 'Campo Grande (GMT-4)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (GMT-4)' },
  { value: 'America/Manaus', label: 'Manaus (GMT-4)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (GMT-5)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (GMT-2)' },
];

function Save() {
  const { pending } = useFormStatus();
  return (
    <button className={`${styles.smallBtn} ${styles.primarySmall}`} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar'}
    </button>
  );
}

export function BusinessForm({ business }: { business: Me['business'] }) {
  const [state, action] = useFormState(saveBusiness, INIT);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<Mode>(business.serviceMode);
  const showAddress = mode !== 'REMOTO';
  const showMeeting = mode !== 'PRESENCIAL';
  useEffect(() => {
    if (state.ok) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 2200);
      return () => clearTimeout(t);
    }
  }, [state.ok]);

  return (
    <form action={action} className={styles.formGrid}>
      {state.error && <p className={styles.error}>{state.error}</p>}

      <div className={`${styles.panel} ${styles.panelPad}`}>
        <h2 className={styles.sectionTitle}>Dados do negócio</h2>
        <label className={`${styles.field} ${styles.gap}`}>
          <span className={styles.label}>Nome do negócio</span>
          <input className={styles.input} name="name" defaultValue={business.name} required />
        </label>
        <div className={styles.formRow}>
          <label className={styles.field}>
            <span className={styles.label}>WhatsApp do negócio</span>
            <MaskedInput kind="phone" className={styles.input} name="phone" defaultValue={business.phone} placeholder="(11) 99999-8888" />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Fuso horário</span>
            <select className={styles.select} name="timezone" defaultValue={business.timezone}>
              {TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={`${styles.field} ${styles.gap}`}>
          <span className={styles.label}>Tipo de atendimento</span>
          <input type="hidden" name="serviceMode" value={mode} />
          <div className={styles.modeGrid}>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`${styles.modeCard} ${mode === m.id ? styles.modeCardOn : ''}`}
                onClick={() => setMode(m.id)}
                aria-pressed={mode === m.id}
              >
                <span className={styles.modeEmoji} aria-hidden>{m.emoji}</span>
                <span>
                  <span className={styles.modeLabel}>{m.label}</span>
                  <span className={styles.modeDesc}>{m.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {showAddress && (
          <label className={styles.field}>
            <span className={styles.label}>Endereço (local de trabalho)</span>
            <input className={styles.input} name="address" defaultValue={business.address ?? ''} placeholder="Rua, número, bairro, cidade" />
          </label>
        )}
        {showMeeting && (
          <label className={styles.field}>
            <span className={styles.label}>Link de atendimento online</span>
            <input className={styles.input} name="meetingUrl" defaultValue={business.meetingUrl ?? ''} placeholder="Ex.: meet.google.com/xxx" />
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.label}>Profissão / ramo</span>
          <input className={styles.input} name="profession" defaultValue={business.profession ?? ''} placeholder="barbearia, nutricionista, estética…" />
        </label>
        <p className={styles.rowMeta}>
          O WhatsApp é o número que recebe os agendamentos. No presencial, o endereço aparece pro
          cliente com link pro mapa; no remoto, mostramos o link de atendimento.
        </p>
      </div>

      <div className={`${styles.panel} ${styles.panelPad}`}>
        <h2 className={styles.sectionTitle}>Regras da agenda</h2>
        <div className={`${styles.formRow} ${styles.gap}`}>
          <label className={styles.field}>
            <span className={styles.label}>Passo dos horários (min)</span>
            <input className={styles.input} name="slotStepMinutes" type="number" min={5} max={120} defaultValue={business.slotStepMinutes} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Antecedência mínima (min)</span>
            <input className={styles.input} name="minLeadMinutes" type="number" min={0} max={10080} defaultValue={business.minLeadMinutes} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Janela (dias à frente)</span>
            <input className={styles.input} name="maxAdvanceDays" type="number" min={1} max={365} defaultValue={business.maxAdvanceDays} />
          </label>
        </div>
        <p className={styles.rowMeta}>
          Passo = de quanto em quanto tempo os horários são ofertados. Antecedência = quanto antes o cliente
          precisa marcar. Janela = até quantos dias pra frente dá pra agendar.
        </p>
      </div>

      <div className={styles.toolbar} style={{ gap: 10, alignItems: 'center' }}>
        {saved && <span className={`${styles.chip} ${styles.chipOk}`}>salvo ✓</span>}
        <Save />
      </div>
    </form>
  );
}
