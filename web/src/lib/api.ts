import type {
  BusinessPage,
  ProfessionalAvailability,
  BookingResult,
  MyAppointment,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';

/** Erro de API que carrega o status HTTP (0 = falha de rede, sem resposta). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// fetch só rejeita em falha de rede/DNS/CORS — nunca por status HTTP. Sem este
// wrapper, uma API fora do ar borbulhava o TypeError cru ("Failed to fetch")
// até a tela do cliente. Aqui vira uma mensagem em português com status 0.
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new ApiError(
      'Não consegui falar com o servidor. Verifique sua conexão e tente de novo.',
      0,
    );
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Preserva o status: a página pública só deve virar 404 quando for 404 de
    // verdade (negócio inexistente) — 500/502/rede são outra coisa.
    throw new ApiError(body?.message ?? `Erro ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

export async function getBusinessPage(slug: string): Promise<BusinessPage> {
  const res = await apiFetch(`${API_BASE}/b/${slug}`, { cache: 'no-store' });
  return handle<BusinessPage>(res);
}

export async function getAvailability(params: {
  slug: string;
  serviceId: string;
  date: string; // YYYY-MM-DD
  professionalId?: string;
}): Promise<ProfessionalAvailability[]> {
  const { slug, serviceId, date, professionalId } = params;
  const qs = new URLSearchParams({ serviceId, date });
  if (professionalId) qs.set('professionalId', professionalId);
  const res = await apiFetch(`${API_BASE}/b/${slug}/availability?${qs}`, { cache: 'no-store' });
  return handle<ProfessionalAvailability[]>(res);
}

export async function createBooking(params: {
  slug: string;
  serviceId: string;
  professionalId: string;
  startAt: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
}): Promise<BookingResult> {
  const { slug, ...body } = params;
  const res = await apiFetch(`${API_BASE}/b/${slug}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handle<BookingResult>(res);
}

export async function getMyAppointments(slug: string, phone: string): Promise<MyAppointment[]> {
  const qs = new URLSearchParams({ phone });
  const res = await apiFetch(`${API_BASE}/b/${slug}/appointments?${qs}`, { cache: 'no-store' });
  return handle<MyAppointment[]>(res);
}

export async function cancelMyAppointment(slug: string, id: string, phone: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/b/${slug}/appointments/${id}/cancel`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  await handle(res);
}
