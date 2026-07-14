'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import styles from '../painel.module.css';

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const res = await fetch('/painel/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErro(body?.message ?? 'Não foi possível enviar.');
        return;
      }
      // Resposta sempre genérica: não revela se o email existe.
      setEnviado(true);
    } catch {
      setErro('Falha de conexão. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={styles.loginWrap}>
      <div className={`${styles.card} ${styles.rise}`}>
        <p className={styles.mark}>agend.ai</p>
        <h1 className={styles.title}>Esqueci minha senha</h1>

        {enviado ? (
          <>
            <p className={styles.subtitle}>
              Se existir uma conta com esse email, enviamos um link para redefinir a senha.
              Confira sua caixa de entrada (e o spam).
            </p>
            <p className={styles.altLink}>
              <Link href="/painel/login">← Voltar ao login</Link>
            </p>
          </>
        ) : (
          <>
            <p className={styles.subtitle}>Informe seu email e enviaremos um link pra redefinir a senha.</p>
            <form onSubmit={onSubmit}>
              {erro && <p className={styles.error}>{erro}</p>}
              <label className={styles.field}>
                <span className={styles.label}>Email</span>
                <input
                  className={styles.input}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <button className={styles.button} type="submit" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Enviar link'}
              </button>
              <p className={styles.altLink}>
                Lembrou? <Link href="/painel/login">Entrar</Link>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
