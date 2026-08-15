import assert from 'node:assert';
import { DateTime } from 'luxon';
import { checkBookableInstant } from './validate-instant';
import { type WorkingInterval } from '../availability/slot-engine';

// ---------------------------------------------------------------------------
// Testes da guarda do instante de agendamento. Puro, sem banco.
// Rode com `npm run test:booking-instant`.
// Cobre o buraco que a auditoria achou: POST /bookings e o agente aceitavam
// qualquer `startAt` cru. Agora o instante tem que ser um slot que a grade
// ofertaria — mesma regra da tela de disponibilidade.
// ---------------------------------------------------------------------------

const TZ = 'America/Sao_Paulo';
const DATE = '2026-03-16'; // uma segunda-feira
const WEEKDAY = DateTime.fromISO(DATE, { zone: TZ }).weekday % 7;

function instant(date: string, hhmm: string): Date {
  return DateTime.fromISO(`${date}T${hhmm}`, { zone: TZ }).toJSDate();
}

const ONTEM = DateTime.fromISO(DATE, { zone: TZ }).minus({ days: 1 }).toJSDate();

// Expediente de segunda: 9h-18h (540-1080) e uma variante só de manhã (9-12).
const seg: WorkingInterval[] = [{ weekday: WEEKDAY, startMinute: 540, endMinute: 1080 }];
const manha: WorkingInterval[] = [{ weekday: WEEKDAY, startMinute: 540, endMinute: 720 }];

const base = {
  timezone: TZ,
  durationMinutes: 30,
  slotStepMinutes: 30,
  minLeadMinutes: 0,
  maxAdvanceDays: 60,
  workingHours: seg,
};

const tests: Array<[string, () => void]> = [
  [
    'segunda 10:00, dentro do expediente e na grade -> ok',
    () => {
      const v = checkBookableInstant({
        ...base,
        requestedStart: instant(DATE, '10:00'),
        now: ONTEM,
      });
      assert.deepStrictEqual(v, { ok: true });
    },
  ],
  [
    'no passado (pedido 10:00, agora 14:00 do mesmo dia) -> unavailable',
    () => {
      const v = checkBookableInstant({
        ...base,
        requestedStart: instant(DATE, '10:00'),
        now: instant(DATE, '14:00'),
      });
      assert.deepStrictEqual(v, { ok: false, code: 'unavailable' });
    },
  ],
  [
    'dentro da antecedência mínima (60min, agora 08:30, pedido 09:00) -> unavailable',
    () => {
      const v = checkBookableInstant({
        ...base,
        minLeadMinutes: 60,
        requestedStart: instant(DATE, '09:00'),
        now: instant(DATE, '08:30'),
      });
      assert.deepStrictEqual(v, { ok: false, code: 'unavailable' });
    },
  ],
  [
    'de madrugada, fora do expediente (03:00) -> unavailable',
    () => {
      const v = checkBookableInstant({
        ...base,
        requestedStart: instant(DATE, '03:00'),
        now: ONTEM,
      });
      assert.deepStrictEqual(v, { ok: false, code: 'unavailable' });
    },
  ],
  [
    'em dia sem expediente (terça, só há horário de segunda) -> unavailable',
    () => {
      const terca = DateTime.fromISO(DATE, { zone: TZ }).plus({ days: 1 }).toFormat('yyyy-LL-dd');
      const v = checkBookableInstant({
        ...base,
        requestedStart: instant(terca, '10:00'),
        now: ONTEM,
      });
      assert.deepStrictEqual(v, { ok: false, code: 'unavailable' });
    },
  ],
  [
    'fora da grade (10:07, passo de 30min a partir das 09:00) -> unavailable',
    () => {
      const v = checkBookableInstant({
        ...base,
        requestedStart: instant(DATE, '10:07'),
        now: ONTEM,
      });
      assert.deepStrictEqual(v, { ok: false, code: 'unavailable' });
    },
  ],
  [
    'serviço de 45min que estoura o fim do expediente (manhã 9-12, pedido 11:30) -> unavailable',
    () => {
      const v = checkBookableInstant({
        ...base,
        workingHours: manha,
        durationMinutes: 45,
        requestedStart: instant(DATE, '11:30'),
        now: ONTEM,
      });
      assert.deepStrictEqual(v, { ok: false, code: 'unavailable' });
    },
  ],
  [
    'além da janela (pedido a 5 dias, maxAdvanceDays=2) -> too-far',
    () => {
      const daqui5 = DateTime.fromISO(DATE, { zone: TZ }).plus({ days: 5 }).toFormat('yyyy-LL-dd');
      const v = checkBookableInstant({
        ...base,
        maxAdvanceDays: 2,
        requestedStart: instant(daqui5, '10:00'),
        now: instant(DATE, '08:00'),
      });
      assert.deepStrictEqual(v, { ok: false, code: 'too-far' });
    },
  ],
  [
    'na borda da janela: maxAdvanceDays=0 ainda deixa marcar hoje mais tarde -> ok',
    () => {
      const v = checkBookableInstant({
        ...base,
        maxAdvanceDays: 0,
        requestedStart: instant(DATE, '10:00'),
        now: instant(DATE, '08:00'),
      });
      assert.deepStrictEqual(v, { ok: true });
    },
  ],
];

let passed = 0;
for (const [nome, fn] of tests) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${nome}`);
  } catch (e) {
    console.error(`  ✗ ${nome}`);
    console.error(`    ${(e as Error).message}`);
  }
}

console.log(`\n${passed}/${tests.length} testes passaram.`);
if (passed !== tests.length) process.exit(1);
