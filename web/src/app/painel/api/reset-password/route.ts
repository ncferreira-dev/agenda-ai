import { NextResponse } from 'next/server';
import { API_BASE } from '@/lib/panel-session';

// Proxy da redefinição de senha. Não loga ninguém: em sucesso o front manda
// pro login (a sessão antiga é invalidada pelo backend).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.token || !body?.password) {
    return NextResponse.json({ message: 'Informe a nova senha.' }, { status: 400 });
  }

  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: body.token, password: body.password }),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { message: data?.message ?? 'Não foi possível redefinir a senha.' },
      { status: res.status },
    );
  }
  return NextResponse.json({ ok: true, message: data?.message ?? 'Senha redefinida.' });
}
