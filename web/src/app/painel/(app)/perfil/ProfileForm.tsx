'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveProfile, type ActionState } from '../../actions';
import { MaskedInput } from '../../MaskedInput';
import type { Me } from '@/lib/panel-api';
import styles from '../../painel.module.css';

const INIT: ActionState = { ok: false };

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <button className={`${styles.smallBtn} ${styles.primarySmall}`} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar perfil'}
    </button>
  );
}

export function ProfileForm({ owner }: { owner: Me['owner'] }) {
  const [state, action] = useFormState(saveProfile, INIT);
  const [preview, setPreview] = useState<string | null>(owner.photoUrl);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (state.ok) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 2200);
      return () => clearTimeout(t);
    }
  }, [state.ok]);

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPreview(URL.createObjectURL(f));
  }

  return (
    <form action={action} className={`${styles.panel} ${styles.panelPad}`}>
      {state.error && <p className={styles.error}>{state.error}</p>}

      <div className={styles.profileTop}>
        <label className={styles.avatarUpload}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.avatarPhoto} src={preview} alt="foto" />
          ) : (
            <span className={styles.avatarFallback}>{initials(owner.name)}</span>
          )}
          <span className={styles.avatarEdit}>Trocar foto</span>
          <input type="file" name="photo" accept="image/*" onChange={onPhoto} hidden />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Nome</span>
        <input className={styles.input} name="name" defaultValue={owner.name} required />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Email (login)</span>
        <input className={styles.input} value={owner.email} disabled />
      </label>

      <div className={styles.formRow}>
        <label className={styles.field}>
          <span className={styles.label}>Telefone</span>
          <MaskedInput kind="phone" className={styles.input} name="phone" defaultValue={owner.phone} placeholder="(11) 99999-9999" />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>CEP</span>
          <MaskedInput kind="cep" className={styles.input} name="cep" defaultValue={owner.cep} placeholder="00000-000" />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>CPF</span>
        <MaskedInput
          kind="cpf"
          className={styles.input}
          name="cpf"
          placeholder={owner.hasCpf ? '•••.•••.•••-•• (já cadastrado)' : '000.000.000-00'}
        />
        <span className={styles.hint}>
          {owner.hasCpf
            ? 'Por segurança, não mostramos o CPF salvo. Deixe em branco para mantê-lo, ou digite um novo para alterar.'
            : 'Guardado de forma cifrada (LGPD); usamos só para identificar a conta.'}
        </span>
      </label>

      <div className={styles.toolbar} style={{ gap: 10, alignItems: 'center' }}>
        {saved && <span className={`${styles.chip} ${styles.chipOk}`}>salvo ✓</span>}
        <Save />
      </div>
    </form>
  );
}
