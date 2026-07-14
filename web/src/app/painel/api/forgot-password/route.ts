import { NextResponse } from 'next/server';
import { API_BASE } from '@/lib/panel-session';

// Proxy do "esqueci minha senha". Repassa a resposta genérica do backend (que
// nunca revela se o email existe).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.email) {
    return NextResponse.json({ message: 'Informe seu email.' }, { status: 400 });
  }

  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: body.email }),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(
    { message: data?.message ?? 'Se existir uma conta, enviamos o link.' },
    { status: res.ok ? 200 : res.status },
  );
}
