import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_BASE, PANEL_COOKIE } from '@/lib/panel-session';

// Fim do login social: o backend nos devolveu aqui com um code de uso único.
// Trocamos o code pelo JWT e gravamos o cookie httpOnly (mesmo padrão do login
// por email/senha). O token nunca fica exposto ao JS do browser.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const loginUrl = new URL('/painel/login', url.origin);

  if (!code) {
    loginUrl.searchParams.set('erro', 'google-falhou');
    return NextResponse.redirect(loginUrl);
  }

  const res = await fetch(`${API_BASE}/auth/oauth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
    cache: 'no-store',
  });

  if (!res.ok) {
    loginUrl.searchParams.set('erro', 'google-falhou');
    return NextResponse.redirect(loginUrl);
  }

  const data = (await res.json()) as { access_token: string };

  cookies().set(PANEL_COOKIE, data.access_token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 dias, igual ao expiresIn do JWT
  });

  return NextResponse.redirect(new URL('/painel', url.origin));
}
