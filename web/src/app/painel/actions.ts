'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { DateTime } from 'luxon';
import { authFetch } from '@/lib/panel-api';
import { API_BASE, PANEL_COOKIE } from '@/lib/panel-session';

export interface ActionState {
  ok: boolean;
  error?: string;
}

const OK: ActionState = { ok: true };

// Lê a mensagem de erro que o backend devolve (BadRequest/Conflict etc.).
async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body?.message as string) ?? fallback;
}

function reais(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Math.round((Number.isFinite(n) ? n : 0) * 100);
}

// --- Serviços ------------------------------------------------------------

// Dias de follow-up do form: vazio -> null (sem follow-up).
function followUpDays(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function createService(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await authFetch('/me/services', {
    method: 'POST',
    body: JSON.stringify({
      name: String(form.get('name') ?? '').trim(),
      durationMinutes: Number(form.get('durationMinutes')),
      priceCents: reais(form.get('preco')),
      followUpDays: followUpDays(form.get('followUpDays')),
      followUpMessage: String(form.get('followUpMessage') ?? '').trim() || null,
    }),
  });
  if (!res.ok) return { ok: false, error: await readError(res, 'Não foi possível criar o serviço.') };
  revalidatePath('/painel/servicos');
  return OK;
}

export async function updateService(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get('id'));
  const res = await authFetch(`/me/services/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: String(form.get('name') ?? '').trim(),
      durationMinutes: Number(form.get('durationMinutes')),
      priceCents: reais(form.get('preco')),
      followUpDays: followUpDays(form.get('followUpDays')),
      followUpMessage: String(form.get('followUpMessage') ?? '').trim() || null,
    }),
  });
  if (!res.ok) return { ok: false, error: await readError(res, 'Não foi possível salvar.') };
  revalidatePath('/painel/servicos');
  return OK;
}

// Sugere intervalo + mensagem de follow-up (IA com fallback no backend).
export interface SuggestResult {
  ok: boolean;
  error?: string;
  followUpDays?: number;
  message?: string;
  source?: 'ai' | 'preset' | 'default';
}
export async function suggestFollowUp(input: {
  description: string;
  profession?: string | null;
}): Promise<SuggestResult> {
  const res = await authFetch('/me/services/suggest-followup', {
    method: 'POST',
    body: JSON.stringify({ description: input.description, profession: input.profession ?? null }),
  });
  if (!res.ok) return { ok: false, error: await readError(res, 'Não consegui sugerir agora.') };
  const data = (await res.json()) as { followUpDays: number; message: string; source: SuggestResult['source'] };
  return { ok: true, followUpDays: data.followUpDays, message: data.message, source: data.source };
}

export async function setServiceActive(form: FormData): Promise<void> {
  const id = String(form.get('id'));
  const active = String(form.get('active')) === 'true';
  await authFetch(`/me/services/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) });
  revalidatePath('/painel/servicos');
}

// --- Profissionais -------------------------------------------------------

async function professionalBody(form: FormData): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    name: String(form.get('name') ?? '').trim(),
    serviceIds: form.getAll('serviceIds').map(String),
    phone: String(form.get('phone') ?? ''),
    cpf: String(form.get('cpf') ?? ''),
  };
  const photo = form.get('photo');
  if (photo instanceof File && photo.size > 0) body.photoUrl = await uploadFile(photo);
  return body;
}

export async function createProfessional(_prev: ActionState, form: FormData): Promise<ActionState> {
  let body: Record<string, unknown>;
  try {
    body = await professionalBody(form);
  } catch {
    return { ok: false, error: 'Falha ao enviar a foto.' };
  }
  const res = await authFetch('/me/professionals', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) return { ok: false, error: await readError(res, 'Não foi possível criar.') };
  revalidatePath('/painel/profissionais');
  return OK;
}

export async function updateProfessional(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get('id'));
  let body: Record<string, unknown>;
  try {
    body = await professionalBody(form);
  } catch {
    return { ok: false, error: 'Falha ao enviar a foto.' };
  }
  const res = await authFetch(`/me/professionals/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  if (!res.ok) return { ok: false, error: await readError(res, 'Não foi possível salvar.') };
  revalidatePath('/painel/profissionais');
  return OK;
}

export async function setProfessionalActive(form: FormData): Promise<void> {
  const id = String(form.get('id'));
  const active = String(form.get('active')) === 'true';
  await authFetch(`/me/professionals/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) });
  revalidatePath('/painel/profissionais');
}

export async function saveWorkingHours(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get('professionalId'));
  let faixas: unknown;
  try {
    faixas = JSON.parse(String(form.get('faixas') ?? '[]'));
  } catch {
    return { ok: false, error: 'Grade inválida.' };
  }
  const res = await authFetch(`/me/professionals/${id}/working-hours`, {
    method: 'PUT',
    body: JSON.stringify({ faixas }),
  });
  if (!res.ok) return { ok: false, error: await readError(res, 'Não foi possível salvar a grade.') };
  revalidatePath('/painel/profissionais');
  return OK;
}

// --- Bloqueios -----------------------------------------------------------

export async function createBlock(_prev: ActionState, form: FormData): Promise<ActionState> {
  const tz = String(form.get('timezone'));
  const date = String(form.get('date'));
  const start = String(form.get('start'));
  const end = String(form.get('end'));

  const startAt = DateTime.fromISO(`${date}T${start}`, { zone: tz });
  const endAt = DateTime.fromISO(`${date}T${end}`, { zone: tz });
  if (!startAt.isValid || !endAt.isValid) {
    return { ok: false, error: 'Data/horário inválidos.' };
  }
  if (endAt <= startAt) {
    return { ok: false, error: 'O fim precisa ser depois do início.' };
  }

  const professionalId = String(form.get('professionalId') ?? '');
  const res = await authFetch('/me/blocks', {
    method: 'POST',
    body: JSON.stringify({
      startAt: startAt.toISO(),
      endAt: endAt.toISO(),
      reason: String(form.get('reason') ?? '').trim() || undefined,
      professionalId: professionalId || undefined,
    }),
  });
  if (!res.ok) return { ok: false, error: await readError(res, 'Não foi possível criar o bloqueio.') };
  revalidatePath('/painel/bloqueios');
  return OK;
}

export async function deleteBlock(form: FormData): Promise<void> {
  const id = String(form.get('id'));
  await authFetch(`/me/blocks/${id}`, { method: 'DELETE' });
  revalidatePath('/painel/bloqueios');
}

export async function createRecurringBlock(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const weekday = Number(form.get('weekday'));
  const start = String(form.get('start') ?? '');
  const end = String(form.get('end') ?? '');
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { ok: false, error: 'Escolha um dia da semana.' };
  }
  if (!start || !end) {
    return { ok: false, error: 'Informe início e fim.' };
  }

  const professionalId = String(form.get('professionalId') ?? '');
  const res = await authFetch('/me/recurring-blocks', {
    method: 'POST',
    body: JSON.stringify({
      weekday,
      start,
      end,
      reason: String(form.get('reason') ?? '').trim() || undefined,
      professionalId: professionalId || undefined,
    }),
  });
  if (!res.ok)
    return { ok: false, error: await readError(res, 'Não foi possível criar o bloqueio recorrente.') };
  revalidatePath('/painel/bloqueios');
  return OK;
}

export async function deleteRecurringBlock(form: FormData): Promise<void> {
  const id = String(form.get('id'));
  await authFetch(`/me/recurring-blocks/${id}`, { method: 'DELETE' });
  revalidatePath('/painel/bloqueios');
}

// --- Aparência / branding ------------------------------------------------

// Envia um arquivo pro backend (/me/uploads) com o token do cookie e devolve a URL.
async function uploadFile(file: File): Promise<string> {
  const token = cookies().get(PANEL_COOKIE)?.value;
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE}/me/uploads`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('upload falhou');
  const data = (await res.json()) as { url: string };
  return data.url;
}

export async function saveAppearance(_prev: ActionState, form: FormData): Promise<ActionState> {
  const patch: Record<string, string> = {
    accentColor: String(form.get('accentColor') ?? ''),
    about: String(form.get('about') ?? ''),
    instagramUrl: String(form.get('instagramUrl') ?? ''),
  };

  // Faz upload só se um arquivo novo veio (campos opcionais).
  const logo = form.get('logo');
  const cover = form.get('cover');
  try {
    if (logo instanceof File && logo.size > 0) patch.logoUrl = await uploadFile(logo);
    if (cover instanceof File && cover.size > 0) patch.coverUrl = await uploadFile(cover);
  } catch {
    return { ok: false, error: 'Falha ao enviar a imagem. Tente um arquivo menor.' };
  }

  const res = await authFetch('/me/business', { method: 'PATCH', body: JSON.stringify(patch) });
  if (!res.ok) return { ok: false, error: await readError(res, 'Não foi possível salvar.') };
  revalidatePath('/painel/aparencia');
  revalidatePath('/painel');
  return OK;
}

// --- Negócio (config operacional) ----------------------------------------

export async function saveBusiness(_prev: ActionState, form: FormData): Promise<ActionState> {
  const body = {
    name: String(form.get('name') ?? ''),
    phone: String(form.get('phone') ?? ''),
    address: String(form.get('address') ?? ''),
    profession: String(form.get('profession') ?? ''),
    timezone: String(form.get('timezone') ?? ''),
    slotStepMinutes: Number(form.get('slotStepMinutes')),
    minLeadMinutes: Number(form.get('minLeadMinutes')),
    maxAdvanceDays: Number(form.get('maxAdvanceDays')),
    reminderHoursBefore: Number(form.get('reminderHoursBefore')),
  };
  const res = await authFetch('/me/business', { method: 'PATCH', body: JSON.stringify(body) });
  if (!res.ok) return { ok: false, error: await readError(res, 'Não foi possível salvar.') };
  revalidatePath('/painel/negocio');
  return OK;
}

// --- Clientes ------------------------------------------------------------

export async function saveCustomerNote(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get('id'));
  const note = String(form.get('note') ?? '');
  const res = await authFetch(`/me/customers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  });
  if (!res.ok) return { ok: false, error: await readError(res, 'Não foi possível salvar.') };
  revalidatePath('/painel/clientes');
  return OK;
}

// --- Perfil do dono ------------------------------------------------------

export async function saveProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  const patch: Record<string, string> = {
    name: String(form.get('name') ?? ''),
    phone: String(form.get('phone') ?? ''),
    cpf: String(form.get('cpf') ?? ''),
    cep: String(form.get('cep') ?? ''),
  };

  const photo = form.get('photo');
  try {
    if (photo instanceof File && photo.size > 0) patch.photoUrl = await uploadFile(photo);
  } catch {
    return { ok: false, error: 'Falha ao enviar a foto. Tente um arquivo menor.' };
  }

  const res = await authFetch('/me/profile', { method: 'PATCH', body: JSON.stringify(patch) });
  if (!res.ok) return { ok: false, error: await readError(res, 'Não foi possível salvar.') };
  revalidatePath('/painel/perfil');
  return OK;
}

// --- Pagamentos (sinal) --------------------------------------------------

export async function savePayments(_prev: ActionState, form: FormData): Promise<ActionState> {
  const requireDeposit = form.get('requireDeposit') === 'on';
  const depositCents = requireDeposit ? reais(form.get('valor')) : null;

  if (requireDeposit && (!depositCents || depositCents <= 0)) {
    return { ok: false, error: 'Defina um valor de sinal maior que zero.' };
  }

  const res = await authFetch('/me/business', {
    method: 'PATCH',
    body: JSON.stringify({ requireDeposit, depositCents }),
  });
  if (!res.ok) return { ok: false, error: await readError(res, 'Não foi possível salvar.') };
  revalidatePath('/painel/pagamentos');
  return OK;
}

// --- Agenda --------------------------------------------------------------

export async function cancelAppointment(form: FormData): Promise<void> {
  const id = String(form.get('id'));
  await authFetch(`/me/appointments/${id}/cancel`, { method: 'PATCH' });
  revalidatePath('/painel');
}

export async function setAppointmentStatus(form: FormData): Promise<void> {
  const id = String(form.get('id'));
  const status = String(form.get('status'));
  await authFetch(`/me/appointments/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  revalidatePath('/painel');
}
