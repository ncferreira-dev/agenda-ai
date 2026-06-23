// Constantes compartilhadas da sessão do painel.
// O JWT do dono vive num cookie httpOnly (não acessível por JS no browser).

export const PANEL_COOKIE = 'painel_token';

// Base da API do backend. Server-side usa API_BASE; cai no público se ausente.
export const API_BASE =
  process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';
