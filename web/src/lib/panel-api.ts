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

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(path);
  if (!res.ok) throw new Error(`Falha ao carregar ${path} (${res.status}).`);
  return res.json() as Promise<T>;
}

// --- Tipos ---------------------------------------------------------------

export interface Me {
  owner: { id: string; email: string };
  business: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    phone: string | null;
    logoUrl: string | null;
    coverUrl: string | null;
    accentColor: string | null;
    about: string | null;
    instagramUrl: string | null;
  };
}

export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
}

export interface Professional {
  id: string;
  name: string;
  active: boolean;
  serviceIds: string[];
}

export interface WorkingHour {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface Block {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
  professionalId: string | null;
}

export interface Appointment {
  id: string;
  startAt: string;
  endAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  service: string;
  professional: string;
  customer: { name: string | null; phone: string };
}

// --- Leituras ------------------------------------------------------------

/** null = sessão expirada/ausente (-> redireciona pro login). */
export async function getMe(): Promise<Me | null> {
  const res = await authFetch('/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Falha ao carregar o painel.');
  return res.json() as Promise<Me>;
}

export const listServices = () => getJson<Service[]>('/me/services');
export const listProfessionals = () => getJson<Professional[]>('/me/professionals');
export const getWorkingHours = (id: string) =>
  getJson<WorkingHour[]>(`/me/professionals/${id}/working-hours`);
export const listBlocks = () => getJson<Block[]>('/me/blocks');

export function listAppointments(params: { from?: string; to?: string; status?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.status) qs.set('status', params.status);
  const suffix = qs.toString() ? `?${qs}` : '';
  return getJson<Appointment[]>(`/me/appointments${suffix}`);
}
