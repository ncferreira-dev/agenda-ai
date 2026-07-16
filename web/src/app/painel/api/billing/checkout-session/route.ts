import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_BASE, PANEL_COOKIE } from '@/lib/panel-session';

// Proxy do checkout: injeta o JWT do cookie httpOnly e chama o backend, que
// devolve a URL da Checkout Session do Stripe. O front só redireciona
// (window.location.href) — quem ativa a assinatura de verdade é o webhook.
export async function POST(req: Request) {
  const token = cookies().get(PANEL_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ message: 'Sessão expirada.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${API_BASE}/me/billing/checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ planId: body?.planId }),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
