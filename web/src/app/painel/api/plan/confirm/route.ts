import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_BASE, PANEL_COOKIE } from '@/lib/panel-session';

// Proxy de confirmação de assinatura: injeta o JWT do cookie httpOnly e chama o
// backend. Enquanto o checkout (Stripe) não existe, o backend só ativa de
// verdade se ENABLE_DEV_BILLING=1; caso contrário responde 403 com a mensagem
// "checkout não ligado", que a tela mostra. Nenhuma cobrança acontece aqui.
export async function POST(req: Request) {
  const token = cookies().get(PANEL_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ message: 'Sessão expirada.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${API_BASE}/me/plan/confirm`, {
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
