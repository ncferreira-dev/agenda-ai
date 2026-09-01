import { DateTime } from 'luxon';

// ---------------------------------------------------------------------------
// Tudo que depende do FUSO DO NEGÓCIO.
//
// É a classe de erro mais silenciosa deste produto: não quebra tela, não gera
// exceção, não aparece em log. Só faz o cliente ler um horário e o dono ler
// outro — e a conta só fecha quando alguém falta ao atendimento.
//
// A regra é sempre a mesma: a hora que aparece na tela é a do NEGÓCIO, nunca a
// do navegador de quem abriu. `getHours()` e `getDay()` do Date usam o fuso da
// máquina, então um cliente viajando (ou um negócio em Manaus visto de São
// Paulo) via o horário errado. Por isso tudo aqui passa por `zone`.
// ---------------------------------------------------------------------------

export const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * "seg, 1 de set às 09:00" — o rótulo que o cliente lê na confirmação e na
 * lista "meus agendamentos". Estava escrito DUAS VEZES dentro do BookingFlow,
 * o que é o começo de as duas telas divergirem.
 *
 * `weekday` do Luxon é 1=segunda … 7=domingo; o `% 7` traz o domingo para 0,
 * que é onde ele está em DIAS_DA_SEMANA.
 */
export function rotuloDeDataHora(iso: string, tz: string): string {
  const d = DateTime.fromISO(iso, { zone: tz });
  if (!d.isValid) return '';
  return `${DIAS_DA_SEMANA[d.weekday % 7]}, ${d.day} de ${MESES[d.month - 1]} às ${doisDigitos(d.hour)}:${doisDigitos(d.minute)}`;
}

/**
 * O DIA CIVIL do atendimento no fuso do negócio ('yyyy-MM-dd').
 *
 * É o que agrupa a agenda por dia. Agrupar em UTC parece funcionar o dia
 * inteiro e erra à noite: um atendimento às 21:00 em São Paulo é 00:00 do dia
 * SEGUINTE em UTC, e apareceria na coluna errada da semana.
 */
export function diaNoFuso(iso: string, tz: string): string {
  const d = DateTime.fromISO(iso, { zone: tz });
  return d.isValid ? d.toFormat('yyyy-MM-dd') : '';
}

/** "HH:mm" no fuso do negócio. */
export function horaNoFuso(iso: string, tz: string): string {
  const d = DateTime.fromISO(iso, { zone: tz });
  return d.isValid ? d.toFormat('HH:mm') : '';
}

export type IntervaloDeBloqueio =
  | { ok: true; startAt: string; endAt: string }
  | { ok: false; erro: string };

/**
 * Converte data + hora de início/fim, digitadas NO FUSO DO NEGÓCIO, no par ISO
 * que vai para a API.
 *
 * É caminho de ESCRITA, e por isso o mais caro de errar aqui: um bloqueio
 * gravado com três horas de diferença libera para agendamento justamente as
 * horas em que o dono não vai estar.
 */
export function intervaloDoBloqueio(
  date: string,
  start: string,
  end: string,
  tz: string,
): IntervaloDeBloqueio {
  const startAt = DateTime.fromISO(`${date}T${start}`, { zone: tz });
  const endAt = DateTime.fromISO(`${date}T${end}`, { zone: tz });

  if (!startAt.isValid || !endAt.isValid) {
    return { ok: false, erro: 'Data/horário inválidos.' };
  }
  if (endAt <= startAt) {
    return { ok: false, erro: 'O fim precisa ser depois do início.' };
  }
  return { ok: true, startAt: startAt.toISO()!, endAt: endAt.toISO()! };
}
