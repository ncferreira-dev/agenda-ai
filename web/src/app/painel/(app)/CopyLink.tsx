'use client';

import { useState } from 'react';
import styles from '../painel.module.css';

export function CopyLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* clipboard indisponível — ignora */
    }
  }

  // Mostra sem o protocolo, mais limpo.
  const display = url.replace(/^https?:\/\//, '');

  return (
    <div className={styles.linkBox}>
      <div>
        <div style={{ fontSize: 12.5, opacity: 0.7, marginBottom: 2 }}>Link público da sua agenda</div>
        <div className={styles.linkUrl}>{display}</div>
      </div>
      <button className={styles.copyBtn} onClick={copiar} type="button">
        {copiado ? 'Copiado ✓' : 'Copiar link'}
      </button>
    </div>
  );
}
