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

/** Uma faixa que o servidor vai recusar, e por quê. */
export interface ProblemaDaFaixa {
  weekday: number;
  indice: number;
  mensagem: string;
}

/**
 * As faixas que o backend vai recusar, encontradas ANTES de enviar.
 *
 * A regra é a mesma de validateWorkingHours: 0 <= início < fim. Antes disto o
 * editor deixava salvar "18:00 até 09:00" e o servidor devolvia
 * "Faixa inválida: exige 0 <= início < fim <= 1440" — correto, e inútil: a
 * pessoa acabou de preencher a semana inteira e não sabe QUAL dia recusar.
 * Dado errado nunca entrou; o que faltava era dizer onde está o erro.
 *
 * Faixa pela metade não é problema: ela é DESCARTADA por faixasParaSalvar, então
 * travar o salvamento por causa dela seria barrar uma linha que a pessoa nem
 * terminou de preencher (e que não vai ser enviada).
 */
export function problemasDaGrade(byDay: GradePorDia): ProblemaDaFaixa[] {
  const problemas: ProblemaDaFaixa[] = [];
  for (const wd of Object.keys(byDay).map(Number)) {
    byDay[wd].forEach((r, indice) => {
      if (!r.start || !r.end) return;
      if (paraMinutos(r.end) <= paraMinutos(r.start)) {
        problemas.push({
          weekday: wd,
          indice,
          mensagem: 'O fim precisa ser depois do início.',
        });
      }
    });
  }
  return problemas;
}

/** Iniciais do profissional para o avatar, em maiúsculas. */
export function iniciaisDoProfissional(name: string): string {
  const p = (name ?? '').trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}
