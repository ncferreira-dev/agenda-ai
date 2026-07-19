'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveNotifications, type ActionState } from '../../actions';
import { PushDeviceButton } from './PushDeviceButton';
import type { Me } from '@/lib/panel-api';
import styles from '../../painel.module.css';

const INIT: ActionState = { ok: false };

function Save() {
  const { pending } = useFormStatus();
  return (
    <button className={`${styles.smallBtn} ${styles.primarySmall}`} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar'}
    </button>
  );
}

export function NotificationsForm({
  business,
  ownerEmail,
}: {
  business: Me['business'];
  ownerPhone: string | null;
  ownerEmail: string | null;
}) {
  const [state, action] = useFormState(saveNotifications, INIT);
  const [all, setAll] = useState(business.notifyOwnerAllBookings);
  const [email, setEmail] = useState(business.notifyEmail);
  const [push, setPush] = useState(business.notifyPush);
  const [daily, setDaily] = useState(business.notifyDailySummary);
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
        <h2 className={styles.sectionTitle}>Quais agendamentos me avisam</h2>
        <label className={styles.switchRow}>
          <input
            type="checkbox"
            name="notifyOwnerAllBookings"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          <span>
            <span className={styles.switchTitle}>Receber aviso de todos os agendamentos</span>
            <span className={styles.switchHint}>
              Ligado: você é avisado de todos, pelos seus canais abaixo. Desligado: só o
              profissional daquele agendamento é avisado (no e-mail dele).
            </span>
          </span>
        </label>
      </div>

      <div className={`${styles.panel} ${styles.panelPad}`}>
        <h2 className={styles.sectionTitle}>Meus canais (dono)</h2>

        <label className={styles.switchRow}>
          <input type="checkbox" name="notifyEmail" checked={email} onChange={(e) => setEmail(e.target.checked)} />
          <span>
            <span className={styles.switchTitle}>Avisar por e-mail</span>
            <span className={styles.switchHint}>Mensagem no seu e-mail quando entrar um agendamento novo.</span>
          </span>
        </label>

        <label className={styles.switchRow} style={{ marginTop: 12 }}>
          <input type="checkbox" name="notifyPush" checked={push} onChange={(e) => setPush(e.target.checked)} />
          <span>
            <span className={styles.switchTitle}>Avisar no navegador/celular (push)</span>
            <span className={styles.switchHint}>Notificação instantânea nos aparelhos ativados abaixo — mesmo com a aba fechada.</span>
          </span>
        </label>
        {push && <PushDeviceButton />}

        <label className={styles.switchRow} style={{ marginTop: 12 }}>
          <input type="checkbox" name="notifyDailySummary" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
          <span>
            <span className={styles.switchTitle}>Resumo diário</span>
            <span className={styles.switchHint}>Toda manhã, a lista de agendamentos do dia pelos canais ligados.</span>
          </span>
        </label>
      </div>

      <div className={`${styles.panel} ${styles.panelPad}`}>
        <h2 className={styles.sectionTitle}>Contatos</h2>
        <p className={styles.rowMeta} style={{ marginBottom: 10 }}>
          Deixe em branco para usar o que está no seu perfil.
        </p>
        <div className={styles.formRow}>
          <label className={styles.field}>
            <span className={styles.label}>E-mail do dono</span>
            <input
              className={styles.input}
              name="ownerEmail"
              type="email"
              defaultValue={business.ownerEmail ?? ''}
              placeholder={ownerEmail ? `perfil: ${ownerEmail}` : 'voce@email.com'}
            />
          </label>
        </div>
      </div>

      <div className={styles.toolbar} style={{ gap: 10, alignItems: 'center' }}>
        {saved && <span className={`${styles.chip} ${styles.chipOk}`}>salvo ✓</span>}
        <Save />
      </div>
    </form>
  );
}
