'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlanId } from './plans';
import type { Quote } from '@/lib/panel-api';
import styles from './planos.module.css';

function brl(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

// Botão "Assinar" -> abre a confirmação com a PROMESSA DE PREÇO por escrito
// (requisito do preço de lançamento) antes de confirmar. O clique final é o
// gancho do checkout: enquanto o Stripe não existe, o backend responde
// "checkout não ligado" (salvo ENABLE_DEV_BILLING=1, pra testar as telas).
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);

  async function confirmar() {
    setErro('');
    setEnviando(true);
    try {
      const res = await fetch('/painel/api/plan/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErro(body?.message ?? 'Não foi possível assinar agora.');
        return;
      }
      setOk(true);
      router.refresh();
      setTimeout(() => router.push('/painel/meu-plano'), 900);
    } catch {
      setErro('Falha de conexão. Tente de novo.');
    } finally {
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

      {open && quote && (
        <div className={styles.modalScrim} role="dialog" aria-modal="true" onClick={() => !enviando && setOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Assinar {planName}</h3>

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

            {erro && <p className={styles.modalErr}>{erro}</p>}
            {ok && <p className={styles.modalOk}>Assinatura ativada ✓ Redirecionando…</p>}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setOpen(false)}
                disabled={enviando || ok}
              >
                Voltar
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={confirmar}
                disabled={enviando || ok}
              >
                {enviando ? 'Confirmando…' : 'Confirmar assinatura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
