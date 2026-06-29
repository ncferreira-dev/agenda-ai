'use client';

import { useState } from 'react';
import styles from '../../../painel.module.css';

// Abre o WhatsApp DO DONO já com a mensagem de retorno pronta (wa.me). Custo
// zero: não usa a API/provider, é o dono mandando do próprio número. O texto é
// editável antes de chamar.
export function WhatsAppButton({ phone, message }: { phone: string; message: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(message);

  // phone vem em E.164 sem "+" (ex.: 5511999998888) — formato que o wa.me espera.
  const href = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

  if (!open) {
    return (
      <button type="button" className={`${styles.smallBtn} ${styles.primarySmall}`} onClick={() => setOpen(true)}>
        Chamar no WhatsApp
      </button>
    );
  }

  return (
    <div className={`${styles.panel} ${styles.panelPad}`} style={{ marginTop: 12 }}>
      <span className={styles.label}>Mensagem de retorno (edite se quiser)</span>
      <textarea
        className={styles.input}
        rows={3}
        maxLength={1000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ marginTop: 8 }}
      />
      <div className={styles.toolbar} style={{ gap: 10, alignItems: 'center', marginTop: 10 }}>
        <button type="button" className={styles.linkBtn} onClick={() => setOpen(false)}>Cancelar</button>
        <a
          className={`${styles.smallBtn} ${styles.primarySmall}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir no WhatsApp
        </a>
      </div>
    </div>
  );
}
