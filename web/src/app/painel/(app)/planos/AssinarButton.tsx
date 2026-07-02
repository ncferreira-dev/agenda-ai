'use client';

import { useState } from 'react';
import type { PlanId } from './plans';
import styles from './planos.module.css';

// Botão "Assinar" — placeholder. O checkout (Mercado Pago) NÃO entra agora;
// este é o ponto exato onde ele vai ligar depois (ver o TODO no handler).
export function AssinarButton({
  planId,
  recommended,
  isCurrent,
}: {
  planId: PlanId;
  recommended?: boolean;
  isCurrent?: boolean;
}) {
  const [aviso, setAviso] = useState(false);

  function assinar() {
    // ───────────────────────────────────────────────────────────────────────
    // TODO(Fase 5 — checkout Mercado Pago): PONTO DE LIGAÇÃO DO PAGAMENTO.
    // Hoje só sinaliza "em breve". Quando a cobrança entrar, troque por:
    //   1. POST pro backend criar o preapproval do Mercado Pago pro `planId`
    //      (auto_recurring mensal no valor do plano; free_trial respeitando o
    //      trial atual; Pix Automático + cartão). Access Token só no backend.
    //   2. redirecionar o dono pro init_point retornado:
    //      window.location.href = initPoint;
    // Nada de cobrança/redirect por enquanto.
    // ───────────────────────────────────────────────────────────────────────
    void planId; // usado só na Fase 5; evita "unused" enquanto é placeholder
    setAviso(true);
  }

  if (isCurrent) {
    return (
      <button type="button" className={styles.cta} disabled>
        Plano atual
      </button>
    );
  }

  return (
    <div className={styles.ctaWrap}>
      <button
        type="button"
        onClick={assinar}
        className={`${styles.cta} ${recommended ? styles.ctaPrimary : ''}`}
      >
        Assinar
      </button>
      {aviso && (
        <p className={styles.ctaHint} role="status">
          🔒 Assinatura em breve. Você será avisado quando abrir.
        </p>
      )}
    </div>
  );
}
