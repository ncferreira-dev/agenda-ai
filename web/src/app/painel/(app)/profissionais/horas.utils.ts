import type { WorkingHour } from '@/lib/panel-api';

// ---------------------------------------------------------------------------
// A grade semanal do profissional, em função pura.
//
// É a matéria-prima da agenda: o motor de horários do backend só oferece slot
// dentro destas faixas. Um minuto errado aqui não aparece na tela do dono —
// aparece como horário que o cliente não consegue marcar, ou como horário
// oferecido quando o profissional não está.
// ---------------------------------------------------------------------------

export interface Faixa {
  start: string; // HH:mm
  end: string;
}

export type GradePorDia = Record<number, Faixa[]>;

/** Minutos desde 00:00 -> "HH:mm". 1440 (fim do dia) vira "24:00". */
export function paraHHmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** "HH:mm" -> minutos desde 00:00. Campo vazio ou torto vira 0, nunca NaN. */
export function paraMinutos(hhmm: string): number {
  const [h, m] = (hhmm ?? '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Semeia a grade a partir do que veio do banco. Todo dia da semana existe no
 * resultado, mesmo vazio — é o que faz o editor mostrar "Fechado" em vez de
 * simplesmente não desenhar a linha do dia.
 */
export function agrupaPorDia(initial: WorkingHour[]): GradePorDia {
  const grade: GradePorDia = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const w of initial ?? []) {
    (grade[w.weekday] ??= []).push({ start: paraHHmm(w.startMinute), end: paraHHmm(w.endMinute) });
  }
  return grade;
}

/**
 * O que de fato é enviado ao servidor.
 *
 * Faixa pela metade (só início, ou só fim) é DESCARTADA: o editor cria a linha
 * antes de a pessoa preencher, e mandar uma faixa incompleta faria o backend
 * recusar a grade inteira por causa de uma linha que a pessoa nem terminou.
 */
export function faixasParaSalvar(
  byDay: GradePorDia,
): { weekday: number; startMinute: number; endMinute: number }[] {
  const out: { weekday: number; startMinute: number; endMinute: number }[] = [];
  for (const wd of Object.keys(byDay).map(Number)) {
    for (const r of byDay[wd]) {
      if (r.start && r.end) {
        out.push({ weekday: wd, startMinute: paraMinutos(r.start), endMinute: paraMinutos(r.end) });
      }
    }
  }
  return out;
}

/** Iniciais do profissional para o avatar, em maiúsculas. */
export function iniciaisDoProfissional(name: string): string {
  const p = (name ?? '').trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}
