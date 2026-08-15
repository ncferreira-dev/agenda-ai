'use client';

import { useState } from 'react';
import type { PlanId } from './plans';
import type { Quote } from '@/lib/panel-api';
import styles from './planos.module.css';

function brl(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

// Botão "Assinar" -> abre a confirmação com a PROMESSA DE PREÇO por escrito
// (requisito do preço de lançamento) antes de confirmar. O clique final abre
// o Checkout do Stripe (redirect de página inteira — não é SPA daqui pra
// frente). Quem ativa a assinatura de verdade é o webhook (/webhook/stripe),
// não este botão: aqui só se abre a cobrança.
export function AssinarButton({
  planId,
  planName,
  recommended,
  isCurrent,
  quote,
}: {
  planId: PlanId;
  planName: string;
  recommended?: boolean;
  isCurrent?: boolean;
  quote: Quote | null;
}) {
  const [open, setOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function assinar() {
    setErro('');
    setEnviando(true);
    try {
      const res = await fetch('/painel/api/billing/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(body?.message ?? 'Não foi possível abrir o checkout agora.');
        setEnviando(false);
        return;
      }
      if (body?.url) {
        // Redirect de página inteira pro Stripe — não é navegação interna do Next.
        window.location.href = body.url;
        return;
      }
      if (body?.switched) {
        // Já tinha assinatura ativa: o plano foi trocado na mesma subscription
        // (sem novo checkout). Reaproveita o banner de "voltou do Stripe" —
        // quem confirma de fato é o webhook, que pode levar alguns segundos.
        window.location.href = '/painel/planos?checkout=sucesso';
        return;
      }
      setErro('Não foi possível abrir o checkout agora.');
      setEnviando(false);
    } catch {
      setErro('Falha de conexão. Tente de novo.');
      setEnviando(false);
    }
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
        onClick={() => setOpen(true)}
        className={`${styles.cta} ${recommended ? styles.ctaPrimary : ''}`}
      >
        Assinar
      </button>

      {open && (
        <div className={styles.modalScrim} role="dialog" aria-modal="true" onClick={() => !enviando && setOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Assinar {planName}</h3>

            {/* O quote (detalhamento de preço) pode não ter carregado — antes o
                modal inteiro era condicionado a `quote`, então o botão "Assinar"
                não abria NADA e parecia quebrado. Agora abre sempre; o
                detalhamento aparece quando existe, e sem ele mostramos um aviso
                e seguimos pro checkout (que não depende do quote). */}
            {quote ? (
              <>
                {/* Promessa de preço POR ESCRITO — condição de lançamento explícita. */}
                <p className={styles.disclosure}>{quote.disclosureText}</p>

                <div className={styles.lineItems}>
                  {quote.lineItems.map((l, i) => (
                    <div key={i} className={styles.lineRow}>
                      <span>{l.label}</span>
                      <span>{l.amountCents < 0 ? `− ${brl(-l.amountCents)}` : brl(l.amountCents)}</span>
                    </div>
                  ))}
                  <div className={`${styles.lineRow} ${styles.lineTotal}`}>
                    <span>Total no 1º mês</span>
                    <span>{brl(quote.firstChargeCents)}</span>
                  </div>
                </div>

                {quote.firstMonthNote && <p className={styles.modalNote}>{quote.firstMonthNote}</p>}
              </>
            ) : (
              <p className={styles.modalNote}>
                Não consegui carregar o detalhamento de preço agora. Você pode
                seguir para o pagamento e os valores aparecem no checkout.
              </p>
            )}

            {erro && <p className={styles.modalErr}>{erro}</p>}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setOpen(false)}
                disabled={enviando}
              >
                Voltar
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={assinar}
                disabled={enviando}
              >
                {enviando ? 'Abrindo pagamento…' : 'Ir para o pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
