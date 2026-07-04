'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { savePassword, type ActionState } from '../../actions';
import type { Me } from '@/lib/panel-api';
import styles from '../../painel.module.css';

const INIT: ActionState = { ok: false };

function Save({ hasPassword }: { hasPassword: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={`${styles.smallBtn} ${styles.primarySmall}`} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : hasPassword ? 'Alterar senha' : 'Definir senha'}
    </button>
  );
}

export function PasswordForm({ owner }: { owner: Me['owner'] }) {
  const [state, action] = useFormState(savePassword, INIT);
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      setSaved(true);
      formRef.current?.reset(); // limpa os campos de senha após salvar
      const t = setTimeout(() => setSaved(false), 2200);
      return () => clearTimeout(t);
    }
  }, [state.ok]);

  const hasPassword = owner.hasPassword;

  return (
    <form ref={formRef} action={action} className={`${styles.panel} ${styles.panelPad}`}>
      <h2 className={styles.sectionTitle}>{hasPassword ? 'Alterar senha' : 'Definir senha'}</h2>
      <p className={styles.lead}>
        {hasPassword
          ? 'Troque a senha que você usa para entrar por email.'
          : 'Sua conta entra pelo Google. Defina uma senha para também poder entrar por email e senha, se quiser.'}
      </p>

      {state.error && <p className={styles.error}>{state.error}</p>}

      {hasPassword && (
        <label className={styles.field}>
          <span className={styles.label}>Senha atual</span>
          <input
            className={styles.input}
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
          />
        </label>
      )}

      <div className={styles.formRow}>
        <label className={styles.field}>
          <span className={styles.label}>Nova senha</span>
          <input
            className={styles.input}
            type="password"
            name="newPassword"
            autoComplete="new-password"
            placeholder="Ao menos 8 caracteres"
            minLength={8}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Confirmar nova senha</span>
          <input
            className={styles.input}
            type="password"
            name="confirm"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
      </div>

      <div className={styles.toolbar} style={{ gap: 10, alignItems: 'center' }}>
        {saved && <span className={`${styles.chip} ${styles.chipOk}`}>salvo ✓</span>}
        <Save hasPassword={hasPassword} />
      </div>
    </form>
  );
}
