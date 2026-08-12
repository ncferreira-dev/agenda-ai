'use client';

import { useState, type InputHTMLAttributes } from 'react';
import styles from './PasswordInput.module.css';

// Campo de senha com botão de olho pra revelar/ocultar o texto. Repassa todos os
// props pro <input>, então cada tela mantém o seu autoComplete/minLength/etc.
// A classe visual continua vindo de fora (painel.module.css .input) — este
// componente só acrescenta o espaço e o botão.

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export default function PasswordInput({ className, ...rest }: Props) {
  const [visivel, setVisivel] = useState(false);

  return (
    <span className={styles.wrap}>
      <input
        {...rest}
        type={visivel ? 'text' : 'password'}
        className={[className, styles.input].filter(Boolean).join(' ')}
      />
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setVisivel((v) => !v)}
        // Sem isso, o clique tira o foco do input (e o <label> em volta devolve
        // o foco depois), fazendo o cursor pular pro fim do texto.
        onMouseDown={(e) => e.preventDefault()}
        aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visivel}
        title={visivel ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {visivel ? <OlhoCortado /> : <Olho />}
      </button>
    </span>
  );
}

function Olho() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function OlhoCortado() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.6 6.7A9.9 9.9 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a18.6 18.6 0 0 1-3.3 4.2M6.4 7.9A18.4 18.4 0 0 0 2 12s3.6 6.5 10 6.5c1.7 0 3.2-.45 4.5-1.15"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.9 9.9a3 3 0 0 0 4.2 4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m3.5 3.5 17 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
