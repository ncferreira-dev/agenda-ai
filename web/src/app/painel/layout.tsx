import type { ReactNode } from 'react';
import styles from './painel.module.css';

// Tema do painel (azul confiável + neutro quente), escopado aqui. As fontes
// (Plus Jakarta Sans / Inter) vêm como CSS vars do layout raiz.
export default function PainelLayout({ children }: { children: ReactNode }) {
  return <div className={styles.theme}>{children}</div>;
}
