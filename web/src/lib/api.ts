import type {
  BusinessPage,
  ProfessionalAvailability,
  BookingResult,
  MyAppointment,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getBusinessPage(slug: string): Promise<BusinessPage> {
  const res = await fetch(`${API_BASE}/b/${slug}`, { cache: 'no-store' });
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
  const res = await fetch(`${API_BASE}/b/${slug}/availability?${qs}`, { cache: 'no-store' });
  return handle<ProfessionalAvailability[]>(res);
}

export async function createBooking(params: {
  slug: string;
  serviceId: string;
  professionalId: string;
  startAt: string;
  name: string;
  phone: string;
  notes?: string;
}): Promise<BookingResult> {
  const { slug, ...body } = params;
  const res = await fetch(`${API_BASE}/b/${slug}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handle<BookingResult>(res);
}

export async function getMyAppointments(slug: string, phone: string): Promise<MyAppointment[]> {
  const qs = new URLSearchParams({ phone });
  const res = await fetch(`${API_BASE}/b/${slug}/appointments?${qs}`, { cache: 'no-store' });
  return handle<MyAppointment[]>(res);
}

export async function cancelMyAppointment(slug: string, id: string, phone: string): Promise<void> {
  const res = await fetch(`${API_BASE}/b/${slug}/appointments/${id}/cancel`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  await handle(res);
}
