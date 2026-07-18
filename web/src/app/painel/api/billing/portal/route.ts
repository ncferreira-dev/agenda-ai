import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_BASE, PANEL_COOKIE } from '@/lib/panel-session';

// Proxy do Portal de Cobrança: injeta o JWT do cookie httpOnly e chama o
// backend, que devolve a URL da página hospedada do Stripe (atualizar cartão,
// ver faturas, cancelar). O front só redireciona (window.location.href).
export async function POST() {
  const token = cookies().get(PANEL_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ message: 'Sessão expirada.' }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}/me/billing/portal`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
