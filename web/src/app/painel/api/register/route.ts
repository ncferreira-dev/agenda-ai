import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_BASE, PANEL_COOKIE } from '@/lib/panel-session';

// Proxy de cadastro: cria negócio + dono no backend e, dando certo, grava o JWT
// no mesmo cookie httpOnly do login (auto-login). Diferente do login, aqui as
// mensagens de erro são úteis (CPF inválido, CPF/email já em uso) e são
// repassadas como vieram do backend.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.email || !body?.password || !body?.businessName || !body?.cpf) {
    return NextResponse.json(
      { message: 'Preencha nome, email, senha, nome do negócio e CPF.' },
      { status: 400 },
    );
  }

  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: body.name,
      email: body.email,
      password: body.password,
      businessName: body.businessName,
      cpf: body.cpf,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { message: err?.message ?? 'Não foi possível criar a conta.' },
      { status: res.status },
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    business: { name: string };
  };

  cookies().set(PANEL_COOKIE, data.access_token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 dias, igual ao expiresIn do JWT
  });

  return NextResponse.json({ ok: true, business: data.business });
}
