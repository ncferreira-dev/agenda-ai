'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import styles from './Typewriter.module.css';

interface TypewriterProps {
  text: string;
  durationMs?: number;
  onDone?: () => void;
}

// Efeito de digitação em CSS puro (animação de "revelar" a largura do texto)
// pra não depender de uma cadeia de setTimeout por letra — em navegadores
// mobile, temporizadores JS de aba em segundo plano podem ser atrasados e
// "estourar" tudo de uma vez, fazendo a animação nunca aparecer visualmente.
//
// O aviso de "terminou" usa um único setTimeout casado com a duração, em vez
// do evento `animationend` do CSS: com duas animações no mesmo elemento
// (digitar + piscar cursor), o nome da animação que dispara o evento tem
// detalhes de suporte entre navegadores que podem simplesmente nunca disparar.
export function Typewriter({ text, durationMs = 1800, onDone }: TypewriterProps) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timeout = setTimeout(() => onDoneRef.current?.(), durationMs);
    return () => clearTimeout(timeout);
  }, [durationMs]);

  const style = {
    '--chars': text.length,
    '--duration': `${durationMs}ms`,
  } as CSSProperties;

  return (
    <span className={styles.type} style={style}>
      {text}
    </span>
  );
}
