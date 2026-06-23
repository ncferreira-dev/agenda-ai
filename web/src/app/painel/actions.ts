'use server';

import { revalidatePath } from 'next/cache';
import { DateTime } from 'luxon';
import { authFetch } from '@/lib/panel-api';

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

export async function createService(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await authFetch('/me/services', {
    method: 'POST',
    body: JSON.stringify({
      name: String(form.get('name') ?? '').trim(),
      durationMinutes: Number(form.get('durationMinutes')),
      priceCents: reais(form.get('preco')),
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
    }),
  });
  if (!res.ok) return { ok: false, error: await readError(res, 'Não foi possível salvar.') };
  revalidatePath('/painel/servicos');
  return OK;
}

export async function setServiceActive(form: FormData): Promise<void> {
  const id = String(form.get('id'));
  const active = String(form.get('active')) === 'true';
  await authFetch(`/me/services/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) });
  revalidatePath('/painel/servicos');
}

// --- Profissionais -------------------------------------------------------

export async function createProfessional(_prev: ActionState, form: FormData): Promise<ActionState> {
  const res = await authFetch('/me/professionals', {
    method: 'POST',
    body: JSON.stringify({
      name: String(form.get('name') ?? '').trim(),
      serviceIds: form.getAll('serviceIds').map(String),
    }),
  });
  if (!res.ok) return { ok: false, error: await readError(res, 'Não foi possível criar.') };
  revalidatePath('/painel/profissionais');
  return OK;
}

export async function updateProfessional(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get('id'));
  const res = await authFetch(`/me/professionals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: String(form.get('name') ?? '').trim(),
      serviceIds: form.getAll('serviceIds').map(String),
    }),
  });
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

// --- Agenda --------------------------------------------------------------

export async function cancelAppointment(form: FormData): Promise<void> {
  const id = String(form.get('id'));
  await authFetch(`/me/appointments/${id}/cancel`, { method: 'PATCH' });
  revalidatePath('/painel');
}
