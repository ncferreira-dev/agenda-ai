import { cookies } from 'next/headers';
import { API_BASE, PANEL_COOKIE } from './panel-session';

// Client server-side do painel. Lê o JWT do cookie httpOnly e o injeta como
// Bearer. O browser nunca vê o token — só este código de servidor.
export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = cookies().get(PANEL_COOKIE)?.value;
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });
}

export interface Me {
  owner: { id: string; email: string };
  business: { id: string; name: string; slug: string; timezone: string; phone: string | null };
}

/** Dados do dono logado, ou null se a sessão expirou/não existe (-> login). */
export async function getMe(): Promise<Me | null> {
  const res = await authFetch('/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Falha ao carregar o painel.');
  return res.json() as Promise<Me>;
}
