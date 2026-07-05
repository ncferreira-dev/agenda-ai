'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../painel.module.css';

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C41.4 35.8 44 30.4 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

type Mode = 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO';

const MODES: { id: Mode; emoji: string; label: string; desc: string }[] = [
  { id: 'PRESENCIAL', emoji: '🏠', label: 'Presencial', desc: 'O cliente vai até o seu local' },
  { id: 'REMOTO', emoji: '💻', label: 'Remoto', desc: 'Atendimento online' },
  { id: 'HIBRIDO', emoji: '🔀', label: 'Híbrido', desc: 'Presencial e online' },
];

// Resposta da API pública ViaCEP (só os campos que usamos).
interface ViaCepResponse {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

// Máscara 00000-000 a partir dos dígitos digitados.
function maskCep(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export default function RegistroPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);

  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('PRESENCIAL');
  // Endereço separado (Presencial/Híbrido). Preenchido à mão ou via ViaCEP.
  const [cep, setCep] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'notfound' | 'error'>('idle');
  const numeroRef = useRef<HTMLInputElement>(null);
  const lastCep = useRef(''); // evita reconsultar o mesmo CEP
  const [meetingUrl, setMeetingUrl] = useState('');

  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Código de indicação vindo do link (?ref=CODE). Lido de window pra não exigir
  // Suspense (useSearchParams). Se presente, o indicado ganha 10% no 1º mês.
  const [referralCode, setReferralCode] = useState('');
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('ref') ?? '';
    const code = raw.trim().toUpperCase();
    if (/^[A-Z0-9]{4,12}$/.test(code)) setReferralCode(code);
  }, []);

  const showAddress = mode !== 'REMOTO';
  const showMeeting = mode !== 'PRESENCIAL';

  // Busca o CEP no ViaCEP ao completar 8 dígitos. Erros não travam o form:
  // aviso discreto e os campos continuam editáveis à mão.
  async function buscarCep(digits: string) {
    if (lastCep.current === digits) return;
    lastCep.current = digits;
    setCepStatus('loading');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) throw new Error('falha');
      const data = (await res.json()) as ViaCepResponse;
      if (data.erro) {
        setCepStatus('notfound');
        return;
      }
      setRua(data.logradouro ?? '');
      setBairro(data.bairro ?? '');
      setCidade(data.localidade ?? '');
      setUf(data.uf ?? '');
      setCepStatus('idle');
      numeroRef.current?.focus(); // usuário só completa o número
    } catch {
      lastCep.current = ''; // deixa tentar de novo o mesmo CEP
      setCepStatus('error');
    }
  }

  function onCepChange(value: string) {
    const masked = maskCep(value);
    setCep(masked);
    const digits = masked.replace(/\D/g, '');
    if (digits.length === 8) buscarCep(digits);
    else setCepStatus('idle');
  }

  // Junta as partes num único endereço (o backend guarda em Business.address).
  // Ex.: "Rua das Flores, 123 - Centro, São Paulo - SP". O CEP fica só como
  // apoio pra buscar/preencher; não entra na string salva (preferência do dono).
  function composeAddress(): string {
    const linha1 = [rua.trim(), numero.trim()].filter(Boolean).join(', ');
    const cidadeUf = [cidade.trim(), uf.trim()].filter(Boolean).join(' - ');
    const local = [bairro.trim(), cidadeUf].filter(Boolean).join(', ');
    return [linha1, local].filter(Boolean).join(' - ');
  }

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
          address: showAddress ? composeAddress() : '',
          meetingUrl: showMeeting ? meetingUrl : '',
          referralCode: referralCode || undefined,
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

            {referralCode && (
              <p className={styles.referralNote}>
                🎁 Você foi indicado — ganha <strong>10% no 1º mês</strong> ao assinar.
              </p>
            )}

            <button
              className={`${styles.social} ${styles.socialGoogle}`}
              type="button"
              onClick={() => { window.location.href = '/painel/api/oauth/google'; }}
            >
              <GoogleIcon /> Continuar com Google
            </button>

            <div className={styles.orRow}>
              <span className={styles.orLine} />
              <span className={styles.orText}>ou cadastre-se com email</span>
              <span className={styles.orLine} />
            </div>

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
                <div className={styles.gap}>
                  <div className={styles.formRow}>
                    <label className={styles.field}>
                      <span className={styles.label}>CEP <span className={styles.optional}>(opcional)</span></span>
                      <input
                        className={styles.input}
                        type="text"
                        inputMode="numeric"
                        value={cep}
                        onChange={(e) => onCepChange(e.target.value)}
                        placeholder="00000-000"
                        maxLength={9}
                      />
                      {cepStatus === 'loading' && <span className={styles.hint}>buscando endereço…</span>}
                      {cepStatus === 'notfound' && (
                        <span className={styles.hint}>CEP não encontrado, preencha manualmente.</span>
                      )}
                      {cepStatus === 'error' && (
                        <span className={styles.hint}>Não deu pra buscar o CEP, preencha manualmente.</span>
                      )}
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Número</span>
                      <input
                        ref={numeroRef}
                        className={styles.input}
                        type="text"
                        inputMode="numeric"
                        value={numero}
                        onChange={(e) => setNumero(e.target.value)}
                        placeholder="123"
                      />
                    </label>
                  </div>

                  <label className={styles.field}>
                    <span className={styles.label}>Rua</span>
                    <input className={styles.input} type="text" value={rua} onChange={(e) => setRua(e.target.value)} placeholder="Rua / Avenida" />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Bairro</span>
                    <input className={styles.input} type="text" value={bairro} onChange={(e) => setBairro(e.target.value)} />
                  </label>

                  <div className={styles.formRow}>
                    <label className={styles.field}>
                      <span className={styles.label}>Cidade</span>
                      <input className={styles.input} type="text" value={cidade} onChange={(e) => setCidade(e.target.value)} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Estado (UF)</span>
                      <input
                        className={styles.input}
                        type="text"
                        value={uf}
                        onChange={(e) => setUf(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                        placeholder="SP"
                        maxLength={2}
                      />
                    </label>
                  </div>
                </div>
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
