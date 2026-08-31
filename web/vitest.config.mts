import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// .mts e não .ts: o package.json do web é CommonJS, e o Vite avisa que carregar
// sintaxe ESM como CJS vai parar de funcionar. A extensão resolve sem mexer no
// module system do projeto inteiro.
//
// Vitest, e não Jest: este projeto é Next 14 com TypeScript e alias `@/`, e o
// Jest exigiria babel/SWC + moduleNameMapper pra chegar no mesmo lugar. Aqui o
// plugin do React e o alias abaixo são a configuração inteira.
//
// jsdom porque metade do que importa no front só existe no navegador: o
// localStorage que guarda o acesso do cliente e o que a pessoa lê na tela.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // A URL não é enfeite: sem ela o jsdom roda em "about:blank", que é uma
    // ORIGEM OPACA — e origem opaca não tem localStorage. O sintoma é
    // window.localStorage === undefined, que parece "jsdom não carregou" e
    // manda a investigação para o lado errado.
    environmentOptions: { jsdom: { url: 'http://localhost:3001/' } },
    setupFiles: ['./vitest.setup.ts'],
    // Mesmo sufixo .spec.ts do backend, de propósito: um jeito só de nomear
    // teste no projeto inteiro.
    include: ['src/**/*.spec.{ts,tsx}'],
    // Sem watch por padrão: `npm test` precisa TERMINAR pra servir de portão
    // no verificador e no CI.
    watch: false,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
