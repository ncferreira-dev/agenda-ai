'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../painel.module.css';

type Mode = 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO';

const MODES: { id: Mode; emoji: string; label: string; desc: string }[] = [
  { id: 'PRESENCIAL', emoji: '🏠', label: 'Presencial', desc: 'O cliente vai até o seu local' },
  { id: 'REMOTO', emoji: '💻', label: 'Remoto', desc: 'Atendimento online' },
  { id: 'HIBRIDO', emoji: '🔀', label: 'Híbrido', desc: 'Presencial e online' },
];

export default function RegistroPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);

  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('PRESENCIAL');
  const [address, setAddress] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');

  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const showAddress = mode !== 'REMOTO';
  const showMeeting = mode !== 'PRESENCIAL';

  function goStep2(e: FormEvent) {
    e.preventDefault();
    setErro('');
    if (!name.trim() || !businessName.trim() || !email.trim()) {
      setErro('Preencha nome, negócio e email.');
      return;
    }
    if (password.length < 8) {
      setErro('A senha precisa de ao menos 8 caracteres.');
      return;
    }
    setStep(2);
  }

  async function criar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const res = await fetch('/painel/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          businessName,
          email,
          password,
          serviceMode: mode,
          address: showAddress ? address : '',
          meetingUrl: showMeeting ? meetingUrl : '',
        }),
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

        <div className={styles.steps} aria-hidden>
          <span className={`${styles.stepDot} ${step === 1 ? styles.stepDotActive : styles.stepDotDone}`}>1</span>
          <span className={styles.stepBar} />
          <span className={`${styles.stepDot} ${step === 2 ? styles.stepDotActive : ''}`}>2</span>
        </div>

        {step === 1 && (
          <>
            <h1 className={styles.title}>Vamos começar</h1>
            <p className={styles.subtitle}>14 dias grátis pra testar tudo, sem cartão. Leva 1 minuto.</p>

            <form onSubmit={goStep2}>
              {erro && <p className={styles.error}>{erro}</p>}

              <label className={styles.field}>
                <span className={styles.label}>Seu nome</span>
                <input className={styles.input} type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Nome do negócio</span>
                <input className={styles.input} type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ex.: Barbearia do Zé" required />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Email</span>
                <input className={styles.input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Senha</span>
                <input className={styles.input} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Ao menos 8 caracteres" minLength={8} required />
              </label>

              <button className={styles.button} type="submit">Continuar</button>
            </form>

            <Link className={styles.methodBack} href="/painel/login">
              Já tenho conta? Entrar
            </Link>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className={styles.title}>Como você atende?</h1>
            <p className={styles.subtitle}>Isso ajusta a sua página. Você pode mudar depois.</p>

            <form onSubmit={criar}>
              {erro && <p className={styles.error}>{erro}</p>}

              <div className={styles.modeGrid}>
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`${styles.modeCard} ${mode === m.id ? styles.modeCardOn : ''}`}
                    onClick={() => setMode(m.id)}
                    aria-pressed={mode === m.id}
                  >
                    <span className={styles.modeEmoji} aria-hidden>{m.emoji}</span>
                    <span>
                      <span className={styles.modeLabel}>{m.label}</span>
                      <span className={styles.modeDesc}>{m.desc}</span>
                    </span>
                  </button>
                ))}
              </div>

              {showAddress && (
                <label className={`${styles.field} ${styles.gap}`}>
                  <span className={styles.label}>Endereço <span className={styles.optional}>(opcional)</span></span>
                  <input className={styles.input} type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, bairro, cidade" />
                </label>
              )}

              {showMeeting && (
                <label className={`${styles.field} ${showAddress ? '' : styles.gap}`}>
                  <span className={styles.label}>Link de atendimento <span className={styles.optional}>(opcional)</span></span>
                  <input className={styles.input} type="text" inputMode="url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="Ex.: meet.google.com/xxx" />
                </label>
              )}

              <button className={styles.button} type="submit" disabled={enviando}>
                {enviando ? 'Criando…' : 'Criar conta e começar'}
              </button>
            </form>

            <button type="button" className={styles.methodBack} onClick={() => setStep(1)}>
              Voltar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
