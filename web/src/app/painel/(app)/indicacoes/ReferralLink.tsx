'use client';

import { useEffect, useState } from 'react';
import styles from './indicacoes.module.css';

// Monta e copia o link de indicação. A origem é lida no cliente (window) pra
// funcionar em qualquer domínio/subdomínio sem depender de env no server.
export function ReferralLink({ code }: { code: string | null }) {
  const [origin, setOrigin] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!code) {
    return (
      <div className={styles.linkCard}>
        <p className={styles.linkHint}>Seu código de indicação está sendo gerado. Recarregue a página.</p>
      </div>
    );
  }

  const url = `${origin}/painel/registro?ref=${code}`;
  const display = origin ? url.replace(/^https?:\/\//, '') : `…/painel/registro?ref=${code}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* clipboard indisponível — ignora */
    }
  }

  return (
    <div className={styles.linkCard}>
      <div className={styles.codeRow}>
        <div>
          <p className={styles.codeLabel}>Seu código</p>
          <p className={styles.code}>{code}</p>
        </div>
        <div className={styles.linkWrap}>
          <p className={styles.codeLabel}>Seu link de indicação</p>
          <p className={styles.linkUrl}>{display}</p>
        </div>
      </div>
      <button type="button" className={styles.copyBtn} onClick={copiar} disabled={!origin}>
        {copiado ? 'Copiado ✓' : 'Copiar link'}
      </button>
    </div>
  );
}
