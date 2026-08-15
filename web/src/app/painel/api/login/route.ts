import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_BASE, PANEL_COOKIE } from '@/lib/panel-session';

// Proxy de login: recebe email/senha, chama o backend e, dando certo, grava o
// JWT num cookie httpOnly. O token nunca fica exposto ao JS do browser.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return NextResponse.json({ message: 'Informe email e senha.' }, { status: 400 });
  }

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: body.email, password: body.password }),
    cache: 'no-store',
  });

  if (!res.ok) {
    // Repassa a mensagem e o status reais do backend (mesmo padrão do cadastro).
    // Fixar 401 "Credenciais inválidas" mascarava dois casos: a conta que só tem
    // login social (mensagem própria do backend, 400) e uma falha 5xx do
    // servidor — ambas viravam "senha errada" e confundiam o dono.
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    return NextResponse.json(
      { message: err?.message ?? 'Credenciais inválidas.' },
      { status: res.status },
    );
  }

  const data = (await res.json()) as { access_token: string; business: { name: string } };

  cookies().set(PANEL_COOKIE, data.access_token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 dias, igual ao expiresIn do JWT
  });

  return NextResponse.json({ ok: true, business: data.business });
}
