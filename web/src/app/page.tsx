'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Typewriter } from '@/components/Typewriter';
import styles from './page.module.css';

// Splash de boas-vindas na raiz do site: digita o nome e cai no login do
// dono. O cliente final não passa por aqui — chega direto no slug do negócio
// (ex.: /barbearia-do-ze) via link/QR code/WhatsApp.
export default function Home() {
  const router = useRouter();
  const [done, setDone] = useState(false);

  function irParaLogin() {
    if (done) return;
    setDone(true);
    setTimeout(() => router.replace('/painel/login'), 500);
  }

  return (
    <main className={styles.splash}>
      <h1 className={styles.wordmark}>
        <Typewriter text="Bem-vindo ao agend.ai" speed={65} onDone={irParaLogin} />
      </h1>
    </main>
  );
}
