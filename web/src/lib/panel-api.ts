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
  owner: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    hasCpf: boolean; // CPF é write-only (LGPD); só sabemos se há um cadastrado
    cep: string | null;
    photoUrl: string | null;
  };
  business: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    phone: string | null;
    address: string | null;
    slotStepMinutes: number;
    minLeadMinutes: number;
    maxAdvanceDays: number;
    reminderHoursBefore: number;
    logoUrl: string | null;
    coverUrl: string | null;
    accentColor: string | null;
    about: string | null;
    instagramUrl: string | null;
    profession: string | null;
    inactiveDays: number;
    vipMinSpentCents: number | null;
    recurringMinVisits: number;
    requireDeposit: boolean;
    depositCents: number | null;
    notifyWhatsApp: boolean;
    notifyEmail: boolean;
    notifyDailySummary: boolean;
    ownerWhatsApp: string | null;
    ownerEmail: string | null;
  };
}

export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
  followUpDays: number | null;
  followUpMessage: string | null;
}

export interface Professional {
  id: string;
  name: string;
  active: boolean;
  phone: string | null;
  cpf: string | null;
  photoUrl: string | null;
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

export interface RecurringBlock {
  id: string;
  weekday: number; // 0 = domingo … 6 = sábado
  startMinute: number;
  endMinute: number;
  reason: string | null;
  professionalId: string | null;
}

export interface AppointmentItem {
  id: string;
  name: string;
  priceCents: number;
}

export interface Appointment {
  id: string;
  startAt: string;
  endAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  paymentStatus: 'NONE' | 'PENDING' | 'PAID'; // sinal/Stripe (Fase 5)
  paid: boolean; // pagamento marcado à mão pelo dono (independe do sinal)
  confirmedByCustomer: boolean;
  service: string;
  totalCents: number; // total editado (soma dos itens)
  items: AppointmentItem[];
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

export type Segment =
  | { kind: 'NOVO' }
  | { kind: 'RECORRENTE' }
  | { kind: 'VIP' }
  | { kind: 'SUMIDO'; inactiveDays: number };

export interface CustomerRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  ownerNote: string | null;
  totalAppointments: number;
  visits: number;
  totalSpentCents: number;
  lastAt: string | null;
  segment: Segment;
}
export const listCustomers = () => getJson<CustomerRow[]>('/me/customers');

export interface CustomerHistoryRow {
  id: string;
  startAt: string;
  status: Appointment['status'];
  paid: boolean;
  totalCents: number;
  service: string;
  professional: string;
  items: AppointmentItem[];
}
export interface CustomerDetail {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  ownerNote: string | null;
  createdAt: string;
  totalSpentCents: number;
  paidCount: number;
  visits: number;
  avgTicketCents: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  segment: Segment;
  topServices: { name: string; count: number }[];
  whatsappMessage: string;
  history: CustomerHistoryRow[];
}
export const getCustomerDetail = (id: string) => getJson<CustomerDetail>(`/me/customers/${id}`);

export const listServices = () => getJson<Service[]>('/me/services');
export const listProfessionals = () => getJson<Professional[]>('/me/professionals');
export const getWorkingHours = (id: string) =>
  getJson<WorkingHour[]>(`/me/professionals/${id}/working-hours`);
export const listBlocks = () => getJson<Block[]>('/me/blocks');
export const listRecurringBlocks = () =>
  getJson<RecurringBlock[]>('/me/recurring-blocks');

export interface ReportBreakdown {
  name: string;
  count: number;
  cents: number;
}
export interface Report {
  previstoCents: number;
  previstoCount: number;
  aReceberCents: number;
  aReceberCount: number;
  recebidoCents: number;
  recebidoCount: number;
  byService: ReportBreakdown[];
  byProfessional: ReportBreakdown[];
}

export function getReport(from: string, to: string) {
  const qs = new URLSearchParams({ from, to });
  return getJson<Report>(`/me/report?${qs}`);
}

export function listAppointments(params: { from?: string; to?: string; status?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.status) qs.set('status', params.status);
  const suffix = qs.toString() ? `?${qs}` : '';
  return getJson<Appointment[]>(`/me/appointments${suffix}`);
}
