'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveBusiness, type ActionState } from '../../actions';
import { MaskedInput } from '../../MaskedInput';
import type { Me } from '@/lib/panel-api';
import styles from '../../painel.module.css';

const INIT: ActionState = { ok: false };

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
        <label className={styles.field}>
          <span className={styles.label}>Endereço (local de trabalho)</span>
          <input className={styles.input} name="address" defaultValue={business.address ?? ''} placeholder="Rua, número, bairro, cidade" />
        </label>
        <p className={styles.rowMeta}>
          O WhatsApp é o número que recebe os agendamentos. O endereço aparece pro cliente na página
          de agendamento, com link pro mapa.
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
