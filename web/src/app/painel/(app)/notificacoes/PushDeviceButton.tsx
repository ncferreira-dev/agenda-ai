'use client';

import { useEffect, useState } from 'react';
import { getPushPublicKey, savePushSubscription, deletePushSubscription } from '../../actions';
import styles from '../../painel.module.css';

// Converte a chave VAPID (base64url) pro formato que o pushManager espera.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Status = 'checking' | 'unsupported' | 'denied' | 'off' | 'on';

export function PushDeviceButton() {
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  useEffect(() => {
    if (!supported) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    // Já existe inscrição neste navegador?
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setStatus(sub ? 'on' : 'off');
    });
  }, [supported]);

  async function enable() {
    setErr(null);
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const publicKey = await getPushPublicKey();
      if (!publicKey) {
        setErr('Push não está configurado no servidor.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setErr('Não consegui registrar este dispositivo.');
        return;
      }
      const res = await savePushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      if (!res.ok) {
        setErr('Falha ao salvar a inscrição.');
        return;
      }
      setStatus('on');
    } catch (e) {
      setErr((e as Error).message || 'Não foi possível ativar.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setErr(null);
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus('off');
    } catch (e) {
      setErr((e as Error).message || 'Não foi possível desativar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 12, paddingLeft: 30 }}>
      {status === 'checking' && <span className={styles.switchHint}>Verificando este dispositivo…</span>}

      {status === 'unsupported' && (
        <span className={styles.switchHint}>
          Este navegador não suporta notificações push. Tente pelo Chrome/Edge no celular ou computador.
        </span>
      )}

      {status === 'denied' && (
        <span className={styles.switchHint}>
          As notificações estão bloqueadas para este site. Libere nas permissões do navegador e recarregue.
        </span>
      )}

      {status === 'off' && (
        <>
          <button type="button" className={styles.smallBtn} onClick={enable} disabled={busy}>
            {busy ? 'Ativando…' : 'Ativar notificações neste dispositivo'}
          </button>
          <span className={styles.switchHint} style={{ display: 'block', marginTop: 6 }}>
            Cada aparelho precisa ser ativado uma vez.
          </span>
        </>
      )}

      {status === 'on' && (
        <>
          <span className={`${styles.chip} ${styles.chipOk}`}>ativado neste dispositivo ✓</span>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={disable}
            disabled={busy}
            style={{ marginLeft: 10 }}
          >
            {busy ? 'Desativando…' : 'desativar aqui'}
          </button>
        </>
      )}

      {err && <p className={styles.error} style={{ marginTop: 8 }}>{err}</p>}
    </div>
  );
}
