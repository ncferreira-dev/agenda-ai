'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveAppearance, type ActionState } from '../../actions';
import type { Me } from '@/lib/panel-api';
import styles from '../../painel.module.css';

const INIT: ActionState = { ok: false };
const DEFAULT = '#2563EB';
const PRESETS = ['#2563EB', '#1E40AF', '#172554', '#0F766E', '#16A34A', '#7C3AED', '#C2410C', '#111827'];
const SKINS: { id: 'clean' | 'bold' | 'suave'; label: string; description: string }[] = [
  { id: 'clean', label: 'Clean', description: 'Clarinho e minimalista.' },
  { id: 'bold', label: 'Bold', description: 'Contraste forte, títulos marcantes.' },
  { id: 'suave', label: 'Suave', description: 'Tons quentes, cantos arredondados.' },
];

function Save() {
  const { pending } = useFormStatus();
  return (
    <button className={`${styles.smallBtn} ${styles.primarySmall}`} type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar aparência'}
    </button>
  );
}

export function AppearanceForm({ business }: { business: Me['business'] }) {
  const [state, action] = useFormState(saveAppearance, INIT);
  const [accent, setAccent] = useState(business.accentColor ?? '');
  const [skin, setSkin] = useState<string>(business.themePreset ?? 'clean');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (state.ok) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 2200);
      return () => clearTimeout(t);
    }
  }, [state.ok]);

  const shown = accent || DEFAULT;

  return (
    <form action={action} className={styles.formGrid}>
      {state.error && <p className={styles.error}>{state.error}</p>}

      {/* COR */}
      <div className={`${styles.panel} ${styles.panelPad}`}>
        <h2 className={styles.sectionTitle}>Cor da marca</h2>
        <p className={styles.rowMeta} style={{ marginBottom: 12 }}>Tematiza sua página pública.</p>

        <input type="hidden" name="accentColor" value={accent} />
        <div className={styles.swatchRow}>
          {PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.swatch} ${accent.toUpperCase() === c ? styles.swatchActive : ''}`}
              style={{ background: c }}
              onClick={() => setAccent(c)}
              aria-label={c}
            />
          ))}
          <label className={styles.swatchCustom} style={{ borderColor: shown }}>
            <input
              type="color"
              value={shown}
              onChange={(e) => setAccent(e.target.value.toUpperCase())}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            +
          </label>
        </div>
        <button type="button" className={styles.linkBtn} onClick={() => setAccent('')}>
          Usar cor padrão
        </button>

        {/* preview ao vivo */}
        <div className={styles.preview} style={{ ['--accent' as string]: shown }}>
          <span className={styles.previewBtn}>Agendar</span>
          <span className={styles.previewLink}>Instagram ↗</span>
          <span className={styles.previewDot} />
        </div>
      </div>

      {/* ESTILO (pele) */}
      <div className={`${styles.panel} ${styles.panelPad}`}>
        <h2 className={styles.sectionTitle}>Estilo da página</h2>
        <p className={styles.rowMeta} style={{ marginBottom: 12 }}>
          Muda o acabamento da sua página pública (cantos, contraste, aconchego).
        </p>
        <input type="hidden" name="themePreset" value={skin} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {SKINS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSkin(s.id)}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 12,
                cursor: 'pointer',
                background: 'var(--surface)',
                border: skin === s.id ? '2px solid var(--accent)' : '1px solid var(--line)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2, lineHeight: 1.3 }}>
                {s.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* IMAGENS */}
      <div className={`${styles.panel} ${styles.panelPad}`}>
        <h2 className={styles.sectionTitle}>Logo e capa</h2>
        <div className={styles.formRow} style={{ marginTop: 12 }}>
          <div>
            <span className={styles.label}>Logo</span>
            {business.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.thumbLogo} src={business.logoUrl} alt="logo atual" />
            )}
            <input className={styles.file} type="file" name="logo" accept="image/*" />
          </div>
          <div>
            <span className={styles.label}>Capa</span>
            {business.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.thumbCover} src={business.coverUrl} alt="capa atual" />
            )}
            <input className={styles.file} type="file" name="cover" accept="image/*" />
          </div>
        </div>
      </div>

      {/* TEXTOS */}
      <div className={`${styles.panel} ${styles.panelPad}`}>
        <h2 className={styles.sectionTitle}>Sobre e contato</h2>
        <label className={`${styles.field} ${styles.gap}`}>
          <span className={styles.label}>Sobre (aparece na página)</span>
          <textarea
            className={styles.input}
            name="about"
            rows={3}
            maxLength={800}
            defaultValue={business.about ?? ''}
            placeholder="Conte em uma frase o que seu negócio tem de especial."
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Instagram (URL)</span>
          <input
            className={styles.input}
            name="instagramUrl"
            defaultValue={business.instagramUrl ?? ''}
            placeholder="https://instagram.com/seunegocio"
          />
        </label>
      </div>

      <div className={styles.toolbar} style={{ gap: 10, alignItems: 'center' }}>
        {saved && <span className={`${styles.chip} ${styles.chipOk}`}>salvo ✓</span>}
        <Save />
      </div>
    </form>
  );
}
