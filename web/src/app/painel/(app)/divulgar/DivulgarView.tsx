'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import styles from '../../painel.module.css';

export function DivulgarView({ url, businessName }: { url: string; businessName: string }) {
  const [qr, setQr] = useState<string>('');
  const [copiado, setCopiado] = useState(false);
  const display = url.replace(/^https?:\/\//, '');

  useEffect(() => {
    QRCode.toDataURL(url, { width: 600, margin: 2, color: { dark: '#211c15', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [url]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* ignora */
    }
  }

  const msg = `Olá! Agende seu horário na ${businessName} por aqui: ${url}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`;

  return (
    <div className={styles.formGrid}>
      <div className={`${styles.panel} ${styles.panelPad}`}>
        <h2 className={styles.sectionTitle}>Seu link</h2>
        <p className={styles.rowMeta} style={{ marginBottom: 12 }}>
          Coloque na bio do Instagram, no Google ou mande pros clientes.
        </p>
        <div className={styles.linkBox}>
          <span className={styles.linkUrl}>{display}</span>
          <button className={styles.copyBtn} type="button" onClick={copiar}>
            {copiado ? 'Copiado ✓' : 'Copiar'}
          </button>
        </div>
        <div className={styles.toolbar} style={{ justifyContent: 'flex-start', gap: 10 }}>
          <a className={`${styles.smallBtn} ${styles.primarySmall}`} href={wa} target="_blank" rel="noopener noreferrer">
            Compartilhar no WhatsApp
          </a>
          <a className={styles.smallBtn} href={url} target="_blank" rel="noopener noreferrer">
            Abrir a página
          </a>
        </div>
      </div>

      <div className={`${styles.panel} ${styles.panelPad}`} style={{ textAlign: 'center' }}>
        <h2 className={styles.sectionTitle} style={{ textAlign: 'left' }}>QR code</h2>
        <p className={styles.rowMeta} style={{ textAlign: 'left', marginBottom: 14 }}>
          Imprima num cartaz ou coloque no balcão. O cliente aponta a câmera e agenda.
        </p>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.qr} src={qr} alt="QR code da agenda" />
        ) : (
          <p className={styles.rowMeta}>Gerando…</p>
        )}
        <div className={styles.toolbar} style={{ justifyContent: 'center' }}>
          {qr && (
            <a className={`${styles.smallBtn} ${styles.primarySmall}`} href={qr} download={`agenda-${businessName}.png`}>
              Baixar QR
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
