import { DateTime } from 'luxon';

// ---------------------------------------------------------------------------
// Motor de disponibilidade (puro, sem banco -> testável).
// Recebe os horários de trabalho + os intervalos ocupados de UM profissional
// num dia, e devolve os horários de início livres pro serviço pedido.
// Toda fronteira de fuso é resolvida com Luxon; o resto opera em epoch millis.
// ---------------------------------------------------------------------------

export interface WorkingInterval {
  /** 0 = domingo ... 6 = sábado (padrão JS getDay) */
  weekday: number;
  /** minutos desde 00:00 no fuso do negócio. 9h = 540 */
  startMinute: number;
  endMinute: number;
}

/** Intervalo ocupado (agendamento existente ou bloqueio), em UTC. */
export interface BusyInterval {
  startAt: Date;
  endAt: Date;
}

export interface SlotEngineInput {
  /** dia a calcular, 'YYYY-MM-DD' interpretado no fuso do negócio */
  date: string;
  timezone: string;
  durationMinutes: number;
  slotStepMinutes: number;
  minLeadMinutes: number;
  workingHours: WorkingInterval[];
  busy: BusyInterval[];
  /** injetável p/ testes; default = agora */
  now?: Date;
}

export interface Slot {
  startAt: Date;
  endAt: Date;
}

const MS_PER_MINUTE = 60_000;

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  // [aStart, aEnd) sobrepõe [bStart, bEnd) sse aStart < bEnd && bStart < aEnd
  return aStart < bEnd && bStart < aEnd;
}

export function computeAvailableSlots(input: SlotEngineInput): Slot[] {
  const {
    date,
    timezone,
    durationMinutes,
    slotStepMinutes,
    minLeadMinutes,
    workingHours,
    busy,
  } = input;

  const now = input.now ?? new Date();
  const earliestMs = now.getTime() + minLeadMinutes * MS_PER_MINUTE;

  // Início do dia no fuso do negócio.
  const dayStart = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  if (!dayStart.isValid) {
    throw new Error(`Data inválida: ${date} (${dayStart.invalidReason})`);
  }

  // Luxon: weekday 1=segunda ... 7=domingo. Convertemos p/ 0=domingo ... 6=sábado.
  const jsWeekday = dayStart.weekday % 7;

  const durationMs = durationMinutes * MS_PER_MINUTE;
  const stepMs = slotStepMinutes * MS_PER_MINUTE;

  // Pré-computa os intervalos ocupados em millis (UTC absoluto).
  const busyMs = busy.map((b) => ({
    start: b.startAt.getTime(),
    end: b.endAt.getTime(),
  }));

  const slots: Slot[] = [];

  for (const wh of workingHours) {
    if (wh.weekday !== jsWeekday) continue;

    // Converte a faixa de trabalho (minutos locais) pra instante absoluto.
    // Usar plus() em cima do startOf('day') resolve DST corretamente.
    const intervalStartMs = dayStart.plus({ minutes: wh.startMinute }).toMillis();
    const intervalEndMs = dayStart.plus({ minutes: wh.endMinute }).toMillis();

    // Gera candidatos a partir do início da faixa, de stepMs em stepMs,
    // enquanto o serviço inteiro couber dentro da faixa.
    for (
      let startMs = intervalStartMs;
      startMs + durationMs <= intervalEndMs;
      startMs += stepMs
    ) {
      const endMs = startMs + durationMs;

      // Antecedência mínima (e nunca no passado).
      if (startMs < earliestMs) continue;

      // Conflito com algum intervalo ocupado?
      const conflict = busyMs.some((b) => overlaps(startMs, endMs, b.start, b.end));
      if (conflict) continue;

      slots.push({ startAt: new Date(startMs), endAt: new Date(endMs) });
    }
  }

  // Ordena e remove duplicatas (faixas que se tocam não duplicam horário).
  slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const unique: Slot[] = [];
  let lastMs = -1;
  for (const s of slots) {
    const ms = s.startAt.getTime();
    if (ms !== lastMs) {
      unique.push(s);
      lastMs = ms;
    }
  }
  return unique;
}

/** Formata um slot pro fuso do negócio, p/ exibir/conferir. Ex.: "14:30". */
export function formatSlot(slot: Slot, timezone: string): string {
  return DateTime.fromJSDate(slot.startAt).setZone(timezone).toFormat('HH:mm');
}
