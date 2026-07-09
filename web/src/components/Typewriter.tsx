'use client';

import { useEffect, useState } from 'react';

interface TypewriterProps {
  text: string;
  speed?: number;
  cursor?: boolean;
  cursorChar?: string;
  onDone?: () => void;
}

// Digita `text` uma vez (sem apagar/repetir) e avisa via onDone ao terminar.
export function Typewriter({ text, speed = 70, cursor = true, cursorChar = '|', onDone }: TypewriterProps) {
  const [charIndex, setCharIndex] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (charIndex >= text.length) {
      onDone?.();
      return;
    }
    const timeout = setTimeout(() => setCharIndex((i) => i + 1), speed);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charIndex, text, speed]);

  useEffect(() => {
    if (!cursor) return;
    const interval = setInterval(() => setShowCursor((v) => !v), 500);
    return () => clearInterval(interval);
  }, [cursor]);

  return (
    <span>
      {text.slice(0, charIndex)}
      {cursor && <span style={{ marginLeft: 2, opacity: showCursor ? 1 : 0 }}>{cursorChar}</span>}
    </span>
  );
}
