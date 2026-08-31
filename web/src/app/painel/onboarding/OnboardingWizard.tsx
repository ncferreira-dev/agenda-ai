'use client';

import { useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  applyVertical,
  finishOnboarding,
  skipOnboarding,
  type ActionState,
} from '../actions';
import type { Me, Skin, VerticalPreset } from '@/lib/panel-api';
import styles from './onboarding.module.css';

const INIT: ActionState = { ok: false };
const COLOR_PRESETS = ['#1C1C1E', '#A6432B', '#1F4D3A', '#1D4ED8', '#7C3AED', '#DB2777', '#0F766E', '#C2410C'];

function FinishButton() {
  const { pending } = useFormStatus();
  return (
    <button className={styles.primary} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Concluir e ver meu painel'}
    </button>
  );
}

export function OnboardingWizard({
  ownerName,
  business,
  verticais,
  skins,
}: {
  ownerName: string;
  business: Me['business'];
  verticais: VerticalPreset[];
  skins: Skin[];
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [chosen, setChosen] = useState<VerticalPreset | null>(null);
  const [accent, setAccent] = useState(business.accentColor ?? '#1C1C1E');
  const [skin, setSkin] = useState<string>(business.themePreset ?? 'clean');
  const [error, setError] = useState('');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [finishState, finishAction] = useFormState(finishOnboarding, INIT);

  function choose(v: VerticalPreset) {
    setError('');
    setApplyingId(v.id);
    startTransition(async () => {
      const res = await applyVertical(v.id, v.temaSugerido);
      setApplyingId(null);
      if (!res.ok) {
        setError(res.error ?? 'Não foi possível aplicar. Tente de novo.');
        return;
      }
      setChosen(v);
      setAccent(v.accentColor);
      setSkin(v.temaSugerido);
      setStep(2);
    });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        {/* Cabeçalho */}
        <header className={styles.head}>
          <span className={styles.logo}>
            agend<span className={styles.logoDot}>.</span>ai
          </span>
          <form action={skipOnboarding}>
            <button className={styles.skip} type="submit">Pular por agora</button>
          </form>
        </header>

        {/* Passos */}
        <div className={styles.steps}>
          <span className={`${styles.dot} ${step === 1 ? styles.dotActive : styles.dotDone}`}>1</span>
          <span className={styles.stepLine} />
          <span className={`${styles.dot} ${step === 2 ? styles.dotActive : ''}`}>2</span>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {step === 1 && (
          <div className={styles.rise}>
            <p className={styles.eyebrow}>Olá, {ownerName.split(' ')[0]} 👋</p>
            <h1 className={styles.title}>Qual é o seu negócio?</h1>
            <p className={styles.lead}>
              Escolha o tipo mais parecido. A gente já cria serviços de exemplo e uma cor combinando.
              Você ajusta tudo depois.
            </p>

            <div className={styles.grid}>
              {verticais.map((v) => {
                const loading = applyingId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    className={styles.vcard}
                    onClick={() => choose(v)}
                    disabled={isPending}
                    style={{ ['--vc' as string]: v.accentColor }}
                  >
                    <span className={styles.vemoji} aria-hidden>{v.emoji}</span>
                    <span className={styles.vlabel}>{v.label}</span>
                    <span className={styles.vmeta}>
                      {loading ? 'aplicando…' : `${v.servicosBase.length} serviços prontos`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && chosen && (
          <div className={styles.rise}>
            <p className={styles.eyebrow}>{chosen.emoji} {chosen.label}</p>
            <h1 className={styles.title}>Deixe com a sua cara</h1>
            <p className={styles.lead}>
              Criamos {chosen.servicosBase.length} serviços e escolhemos uma cor. Ajuste o visual à
              vontade, nada aqui é definitivo.
            </p>

            <form action={finishAction} className={styles.form}>
              {finishState.error && <p className={styles.error}>{finishState.error}</p>}
              <input type="hidden" name="accentColor" value={accent} />
              <input type="hidden" name="themePreset" value={skin} />

              {/* Cor */}
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>Cor da marca</h2>
                <div className={styles.swatchRow}>
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`${styles.swatch} ${accent.toUpperCase() === c.toUpperCase() ? styles.swatchOn : ''}`}
                      style={{ background: c }}
                      onClick={() => setAccent(c)}
                      aria-label={c}
                    />
                  ))}
                  <label className={styles.swatchCustom} style={{ borderColor: accent }}>
                    <input
                      type="color"
                      value={accent}
                      onChange={(e) => setAccent(e.target.value.toUpperCase())}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    +
                  </label>
                </div>
              </section>

              {/* Pele */}
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>Estilo da página</h2>
                <div className={styles.skinRow}>
                  {skins.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`${styles.skinCard} ${skin === s.id ? styles.skinOn : ''}`}
                      onClick={() => setSkin(s.id)}
                    >
                      <span className={styles.skinMini} data-skin={s.id} style={{ ['--accent' as string]: accent }}>
                        <span className={styles.skinBar} />
                        <span className={styles.skinChip} />
                      </span>
                      <span className={styles.skinLabel}>{s.label}</span>
                      <span className={styles.skinDesc}>{s.description}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Logo */}
              <section className={styles.block}>
                <h2 className={styles.blockTitle}>Logo (opcional)</h2>
                {business.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.logoThumb} src={business.logoUrl} alt="logo atual" />
                )}
                <input className={styles.file} type="file" name="logo" accept="image/*" />
              </section>

              <div className={styles.actions}>
                <button type="button" className={styles.ghost} onClick={() => setStep(1)}>
                  ← trocar o tipo
                </button>
                <FinishButton />
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
