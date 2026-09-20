/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // A raiz leva para o login. Precisa ficar AQUI, e não só no `redirect()` de
  // `app/page.tsx`: pré-renderizada, aquela página devolve 307 sem cabeçalho
  // `Location`, com o destino escondido no payload do React. Navegador segue;
  // curl, monitor de uptime, robô de busca e prévia de link não seguem.
  // Medido em 2026-09-20 em agenda-ai-alpha.vercel.app.
  async redirects() {
    return [{ source: '/', destination: '/painel/login', permanent: false }];
  },
};

export default nextConfig;
