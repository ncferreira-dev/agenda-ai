import { NextResponse } from 'next/server';
import { API_BASE } from '@/lib/panel-session';

// Início do login social: manda o navegador pro backend, que fala com o Google.
// Fica numa rota do Next pra não precisar expor a URL da API no client.
export function GET() {
  return NextResponse.redirect(`${API_BASE}/auth/oauth/google`);
}
