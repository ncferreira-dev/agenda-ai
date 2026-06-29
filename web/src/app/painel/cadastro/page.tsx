'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MaskedInput } from '../MaskedInput';
import styles from '../painel.module.css';

export default function CadastroPage() {
  const router = useRouter();
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const form = new FormData(e.currentTarget);
      const res = await fetch('/painel/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? ''),
          businessName: String(form.get('businessName') ?? ''),
          cpf: String(form.get('cpf') ?? ''),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErro(body?.message ?? 'Não foi possível criar a conta.');
        return;
      }
      // Conta criada e já logada (cookie setado pela rota). Vai pro painel.
      router.replace('/painel');
      router.refresh();
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
        <h1 className={styles.title}>Criar conta</h1>
        <p className={styles.subtitle}>Comece a receber agendamentos hoje.</p>

        <form onSubmit={onSubmit}>
          {erro && <p className={styles.error}>{erro}</p>}

          <label className={styles.field}>
            <span className={styles.label}>Seu nome</span>
            <input className={styles.input} name="name" autoComplete="name" required autoFocus />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Nome do negócio</span>
            <input className={styles.input} name="businessName" placeholder="Ex.: Barbearia do Zé" required />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <input className={styles.input} type="email" name="email" autoComplete="email" required />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Senha</span>
            <input className={styles.input} type="password" name="password" autoComplete="new-password" minLength={8} required />
            <span className={styles.hint}>Pelo menos 8 caracteres.</span>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>CPF</span>
            <MaskedInput kind="cpf" className={styles.input} name="cpf" placeholder="000.000.000-00" />
          </label>

          <button className={styles.button} type="submit" disabled={enviando}>
            {enviando ? 'Criando…' : 'Criar conta'}
          </button>

          <p className={styles.altLink}>
            Já tem conta? <Link href="/painel/login">Entrar</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
