import { DateTime } from 'luxon';
import {
  computeAvailableSlots,
  type WorkingInterval,
} from '../availability/slot-engine';

// ---------------------------------------------------------------------------
// Valida se um INSTANTE pedido pode virar agendamento. É a guarda que faltava
// no caminho de criação: o motor de slots só ERA usado por quem OFERTA horários
// (availability.service), então quem chamava POST /bookings ou o agente do
// WhatsApp podia mandar um `startAt` cru — no passado, de madrugada, em dia de
// folga, fora da grade ou a anos de distância — e o agendamento nascia mesmo
// assim (os rechecks só olhavam conflito/bloqueio).
//
// Em vez de reescrever as regras aqui (e arriscar divergir do que é ofertado),
// esta função CHAMA O MESMO MOTOR com `busy: []` e pergunta: "esse instante é
// um slot que a grade ofertaria neste dia?". Assim expediente, antecedência
// mínima, não-no-passado e alinhamento à grade vêm de uma fonte só e não podem
// discordar da tela de disponibilidade. Conflitos ao vivo (agendamento/bloqueio
// que surgiu no meio) seguem sendo checados na transação, com a exclusion
// constraint do banco como última linha — este arquivo NÃO cuida disso.
//
// `maxAdvanceDays` é a única regra que o motor não cobre (ele calcula um único
// dia), então fica aqui.
// ---------------------------------------------------------------------------

export interface InstantCheckInput {
  /** Instante absoluto que o cliente quer (já validado como Date válido). */
  requestedStart: Date;
  timezone: string;
  durationMinutes: number;
  slotStepMinutes: number;
  minLeadMinutes: number;
  maxAdvanceDays: number;
  workingHours: WorkingInterval[];
  /** injetável p/ testes; default = agora */
  now?: Date;
}

export type InstantVerdict =
  | { ok: true }
  // além da janela de agendamento do negócio (marcar muito à frente)
  | { ok: false; code: 'too-far' }
  // no passado, dentro da antecedência mínima, fora do expediente,
  // ou desalinhado da grade de horários — ou seja, nunca seria ofertado
  | { ok: false; code: 'unavailable' };

export function checkBookableInstant(input: InstantCheckInput): InstantVerdict {
  const now = input.now ?? new Date();
  const requested = DateTime.fromJSDate(input.requestedStart).setZone(input.timezone);

  // Janela máxima: não deixa marcar além de maxAdvanceDays (contados no fuso do
  // negócio, até o fim daquele dia — "dá pra marcar até N dias à frente").
  const limite = DateTime.fromJSDate(now)
    .setZone(input.timezone)
    .plus({ days: input.maxAdvanceDays })
    .endOf('day');
  if (requested > limite) {
    return { ok: false, code: 'too-far' };
  }

  // Dia do instante pedido, no fuso do negócio: é o dia que o motor vai calcular.
  const date = requested.toFormat('yyyy-LL-dd');

  // `busy: []` de propósito — aqui só validamos expediente/antecedência/grade.
  // Se o instante é um dos slots que a grade geraria, ele é "ofertável".
  const slots = computeAvailableSlots({
    date,
    timezone: input.timezone,
    durationMinutes: input.durationMinutes,
    slotStepMinutes: input.slotStepMinutes,
    minLeadMinutes: input.minLeadMinutes,
    workingHours: input.workingHours,
    busy: [],
    now,
  });

  const alvo = input.requestedStart.getTime();
  const ofertavel = slots.some((s) => s.startAt.getTime() === alvo);
  return ofertavel ? { ok: true } : { ok: false, code: 'unavailable' };
}
