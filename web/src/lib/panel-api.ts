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
    hasPassword: boolean; // false = conta só por login social (Google); pode definir senha
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
    serviceMode: 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO';
    meetingUrl: string | null;
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
    themePreset: string | null; // pele visual: clean | bold | suave
    onboardedAt: string | null; // ISO; null = onboarding pendente
    inactiveDays: number;
    vipMinSpentCents: number | null;
    recurringMinVisits: number;
    notifyWhatsApp: boolean;
    notifyEmail: boolean;
    notifyPush: boolean;
    notifyOwnerAllBookings: boolean;
    notifyDailySummary: boolean;
    ownerWhatsApp: string | null;
    ownerEmail: string | null;
    plan: 'START' | 'PRO' | 'ULTRA' | null;
    subscriptionStatus: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
    trialEndsAt: string | null; // ISO; null se não houver trial
  };
}

export interface KitMember {
  memberServiceId: string;
  position: number;
  member: { id: string; name: string; durationMinutes: number; priceCents: number };
}

export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
  followUpDays: number | null;
  followUpMessage: string | null;
  discountKind: 'PERCENT' | 'FIXED' | null;
  discountValue: number;
  isKit: boolean;
  kitItems: KitMember[];
}

export interface Professional {
  id: string;
  name: string;
  active: boolean;
  phone: string | null;
  email: string | null;
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
  paid: boolean; // pagamento marcado à mão pelo dono
  confirmedByCustomer: boolean;
  service: string;
  totalCents: number; // total editado (soma dos itens)
  items: AppointmentItem[];
  professional: string;
  professionalPhone: string | null; // E.164 s/ '+'; base do link wa.me
  professionalHasEmail: boolean; // já tem canal automático? se não, mostra o botão manual
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

// --- Assinatura / Meu plano ----------------------------------------------

export interface PlanBenefit {
  label: string;
  href: string;
}

export interface MyPlan {
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  planId: 'START' | 'PRO' | 'ULTRA' | null;
  planName: string | null;
  tagline: string | null;
  who: string | null;
  benefits: PlanBenefit[];
  subscribedAt: string | null;
  currentPeriodEndsAt: string | null; // data de renovação (ISO)
  currentPriceCents: number | null; // o que paga hoje
  priceChange: { at: string; toCents: number } | null; // quando/para quanto muda
  trialEndsAt: string | null;
  referralCreditCents: number;
}
export const getMyPlan = () => getJson<MyPlan>('/me/plan');

export interface QuoteLine {
  label: string;
  amountCents: number; // negativo = desconto
}
export interface Quote {
  promoCents: number;
  fullCents: number;
  hasTransition: boolean;
  referredDiscountCents: number;
  creditAppliedCents: number;
  firstChargeCents: number;
  lineItems: QuoteLine[];
  disclosureText: string; // promessa de preço por escrito
  firstMonthNote: string | null;
}
export const getQuote = (planId: string) =>
  getJson<Quote>(`/me/plan/quote?planId=${encodeURIComponent(planId)}`);

export interface ReferralStats {
  code: string | null;
  totalReferrals: number;
  convertedReferrals: number;
  pendingReferrals: number;
  creditCents: number;
}
export const getReferralStats = () => getJson<ReferralStats>('/me/referrals');

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

// --- Onboarding (verticais + peles) --------------------------------------

export interface VerticalPreset {
  id: string;
  label: string;
  emoji: string;
  accentColor: string;
  temaSugerido: 'clean' | 'bold' | 'suave';
  servicosBase: { name: string; durationMinutes: number; priceCents: number }[];
  categoriasProdutoSugeridas: string[];
}
export interface Skin {
  id: 'clean' | 'bold' | 'suave';
  label: string;
  description: string;
}
export const listVerticais = () =>
  getJson<{ verticais: VerticalPreset[]; skins: Skin[] }>('/me/verticais');

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

export interface ProRevenueRow {
  professionalId: string;
  name: string;
  count: number;
  generatedCents: number;
  workedMinutes: number;
  daysWorked: number;
}
export interface ProfessionalRevenueReport {
  professionals: ProRevenueRow[];
  totalCount: number;
  totalGeneratedCents: number;
  totalWorkedMinutes: number;
  totalDaysWorked: number;
}

export function getProfessionalRevenue(from: string, to: string, professionalId?: string) {
  const qs = new URLSearchParams({ from, to });
  if (professionalId) qs.set('professionalId', professionalId);
  return getJson<ProfessionalRevenueReport>(`/me/report/by-professional?${qs}`);
}

export function listAppointments(params: { from?: string; to?: string; status?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.status) qs.set('status', params.status);
  const suffix = qs.toString() ? `?${qs}` : '';
  return getJson<Appointment[]>(`/me/appointments${suffix}`);
}
