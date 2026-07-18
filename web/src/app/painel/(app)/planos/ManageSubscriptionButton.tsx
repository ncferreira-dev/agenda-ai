'use client';

import { useState } from 'react';
import styles from './planos.module.css';

// Botão "Gerenciar assinatura" -> abre o Portal de Cobrança do Stripe (página
// hospedada onde o dono atualiza o cartão, vê faturas e cancela sozinho).
// Redirect de página inteira, igual ao checkout. Só aparece pra quem já assinou.
export function ManageSubscriptionButton() {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function abrir() {
    setErro('');
    setEnviando(true);
    try {
      const res = await fetch('/painel/api/billing/portal', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.url) {
        window.location.href = body.url;
        return;
      }
      setErro(body?.message ?? 'Não foi possível abrir a gestão da assinatura agora.');
      setEnviando(false);
    } catch {
      setErro('Falha de conexão. Tente de novo.');
      setEnviando(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className={styles.manageBtn}
        onClick={abrir}
        disabled={enviando}
      >
        {enviando ? 'Abrindo…' : 'Gerenciar assinatura'}
      </button>
      {erro && <p className={styles.bannerHint}>{erro}</p>}
    </div>
  );
}
