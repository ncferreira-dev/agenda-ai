'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import styles from './Typewriter.module.css';

interface TypewriterProps {
  text: string;
  durationMs?: number;
  onDone?: () => void;
}

// Efeito de digitação em CSS puro (animação de "revelar" a largura do texto).
// Evita depender de uma cadeia de setTimeout por letra: em navegadores
// mobile, temporizadores JS de uma aba em segundo plano podem ser
// atrasados/agrupados pelo navegador e "estourar" tudo de uma vez, fazendo a
// animação nunca aparecer. Animação CSS é tocada pelo motor de renderização,
// não pelo relógio de timers do JS.
export function Typewriter({ text, durationMs = 1800, onDone }: TypewriterProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onDone) return;
    function handleEnd(e: AnimationEvent) {
      if (e.animationName === 'reveal') onDone?.();
    }
    el.addEventListener('animationend', handleEnd);
    return () => el.removeEventListener('animationend', handleEnd);
  }, [onDone]);

  const style = {
    '--chars': text.length,
    '--duration': `${durationMs}ms`,
  } as CSSProperties;

  return (
    <span ref={ref} className={styles.type} style={style}>
      {text}
    </span>
  );
}
