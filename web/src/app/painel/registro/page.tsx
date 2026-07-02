'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isValidCpf, maskFormat } from '@/lib/format';
import styles from '../painel.module.css';

export default function RegistroPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cpf, setCpf] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');

    // Feedback instantâneo (o backend revalida tudo de qualquer forma).
    if (password.length < 8) {
      setErro('A senha precisa de ao menos 8 caracteres.');
      return;
    }
    if (!isValidCpf(cpf)) {
      setErro('CPF inválido. Confira os números.');
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch('/painel/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, businessName, email, password, cpf }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErro(body?.message ?? 'Não foi possível criar a conta.');
        return;
      }
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
        <h1 className={styles.title}>Crie sua conta</h1>
        <p className={styles.subtitle}>14 dias grátis pra testar tudo, sem cartão.</p>

        <form onSubmit={onSubmit}>
          {erro && <p className={styles.error}>{erro}</p>}

          <label className={styles.field}>
            <span className={styles.label}>Seu nome</span>
            <input
              className={styles.input}
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Nome do negócio</span>
            <input
              className={styles.input}
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Ex.: Barbearia do Zé"
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <input
              className={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Senha</span>
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ao menos 8 caracteres"
              minLength={8}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>CPF</span>
            <input
              className={styles.input}
              name="cpf"
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(maskFormat('cpf', e.target.value))}
              placeholder="000.000.000-00"
              required
            />
          </label>

          <button className={styles.button} type="submit" disabled={enviando}>
            {enviando ? 'Criando…' : 'Criar conta e começar'}
          </button>
        </form>

        <Link className={styles.methodBack} href="/painel/login">
          Já tenho conta? Entrar
        </Link>
      </div>
    </div>
  );
}
