'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './booking.module.css';

// Detecta imagem quebrada mesmo quando o load falhou antes da hidratação
// terminar (SSR): nesse caso o evento onError já disparou no HTML puro,
// antes do React anexar o listener, e nunca chega até nós. Checar
// img.complete + naturalWidth 0 no mount cobre esse caso.
function useBrokenImage(src: string | null) {
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setBroken(false);
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setBroken(true);
    }
  }, [src]);

  return { ref, broken, onError: () => setBroken(true) };
}

// Capa: se não houver URL, ou se a URL falhar ao carregar (ex.: arquivo
// perdido no storage), cai no gradiente de marca em vez de ícone quebrado.
export function CoverImage({ src }: { src: string | null }) {
  const { ref, broken, onError } = useBrokenImage(src);

  if (!src || broken) return <div className={styles.heroGradient} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} className={styles.cover} src={src} alt="" onError={onError} />
  );
}

// Logo: se não houver URL, ou se falhar, cai num círculo com a inicial
// do negócio na cor de destaque — nunca um ícone de imagem quebrada.
export function LogoAvatar({ src, name }: { src: string | null; name: string }) {
  const { ref, broken, onError } = useBrokenImage(src);

  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img ref={ref} className={styles.logo} src={src} alt={name} onError={onError} />
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className={styles.logoFallback} aria-hidden="true">
      {initial}
    </div>
  );
}
