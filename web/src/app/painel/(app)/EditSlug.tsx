'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { updateSlug, type ActionState } from '../actions';
import styles from '../painel.module.css';

const INIT: ActionState = { ok: false };

function Save() {
  const { pending } = useFormStatus();
  return (
    <button className={`${styles.smallBtn} ${styles.primarySmall}`} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar novo link'}
    </button>
  );
}

export function EditSlug({ slug, origin }: { slug: string; origin: string }) {
  const [state, action] = useFormState(updateSlug, INIT);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(slug);
  const [saved, setSaved] = useState(false);

  // Ao salvar com sucesso: fecha o editor e mostra o aviso de confirmação.
  useEffect(() => {
    if (state.ok) {
      setEditing(false);
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 3500);
      return () => clearTimeout(t);
    }
  }, [state.ok]);

  // Prefixo visual (sem protocolo) do link público.
  const prefix = origin.replace(/^https?:\/\//, '') + '/';

  if (!editing) {
    return (
      <div className={styles.toolbar} style={{ gap: 10, alignItems: 'center', marginTop: -6 }}>
        <button
          type="button"
          className={styles.linkBtn}
          onClick={() => {
            setValue(slug);
            setEditing(true);
          }}
        >
          Editar link
        </button>
        {saved && <span className={`${styles.chip} ${styles.chipOk}`}>link atualizado ✓</span>}
      </div>
    );
  }

  return (
    <form action={action} className={`${styles.panel} ${styles.panelPad}`} style={{ marginTop: -6 }}>
      <h2 className={styles.sectionTitle}>Editar o link público</h2>

      <div className={styles.notice} style={{ marginTop: 10 }}>
        ⚠️ Ao trocar o link, o <strong>endereço antigo deixa de funcionar</strong>. Lembre de
        atualizar onde você divulgou: bio do Instagram, perfil do Google, cartão e mensagens.
      </div>

      <label className={styles.field} style={{ marginTop: 12 }}>
        <span className={styles.label}>Novo link</span>
        <div className={styles.linkBox} style={{ gap: 2 }}>
          <span className={styles.linkUrl} style={{ opacity: 0.6 }}>{prefix}</span>
          <input
            name="slug"
            className={styles.input}
            value={value}
            autoFocus
            inputMode="text"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) =>
              // Só minúsculas, números e hífen — o backend revalida de qualquer jeito.
              setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
            }
            placeholder="barbearia-do-ze"
            style={{ flex: 1, minWidth: 0 }}
          />
        </div>
        <span className={styles.hint}>Use letras minúsculas, números e hífen. Entre 3 e 40 caracteres.</span>
      </label>

      {state.error && <p className={styles.error}>{state.error}</p>}

      <div className={styles.toolbar} style={{ gap: 10, alignItems: 'center', marginTop: 12 }}>
        <button type="button" className={styles.linkBtn} onClick={() => setEditing(false)}>
          Cancelar
        </button>
        <Save />
      </div>
    </form>
  );
}
