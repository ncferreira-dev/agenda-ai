'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from '../painel.module.css';

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');
    if (password.length < 8) {
      setErro('A senha deve ter ao menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setErro('As senhas não conferem.');
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch('/painel/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErro(body?.message ?? 'Não foi possível redefinir a senha.');
        return;
      }
      // Senha trocada: a sessão antiga foi invalidada. Manda pro login.
      setOk(true);
      setTimeout(() => router.replace('/painel/login'), 1500);
    } catch {
      setErro('Falha de conexão. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  if (ok) {
    return (
      <>
        <p className={styles.subtitle}>Senha redefinida! Redirecionando pro login…</p>
        <p className={styles.altLink}>
          <Link href="/painel/login">Entrar agora</Link>
        </p>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      {erro && <p className={styles.error}>{erro}</p>}
      <label className={styles.field}>
        <span className={styles.label}>Nova senha</span>
        <input
          className={styles.input}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          autoFocus
        />
        <span className={styles.hint}>Pelo menos 8 caracteres.</span>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Confirmar senha</span>
        <input
          className={styles.input}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </label>
      <button className={styles.button} type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Redefinir senha'}
      </button>
    </form>
  );
}
