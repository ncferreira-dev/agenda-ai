import type { ReactNode } from 'react';
import { Fraunces, Hanken_Grotesk } from 'next/font/google';
import styles from './painel.module.css';

// Display serif com caráter (títulos) + grotesk limpo e legível (corpo/UI).
const display = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const body = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

// Tema do painel (papel quente + tinta + acento terracota), escopado aqui —
// não interfere na página pública de agendamento.
export default function PainelLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${display.variable} ${body.variable} ${styles.theme}`}>{children}</div>
  );
}
