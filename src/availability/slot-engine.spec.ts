import assert from 'node:assert';
import { DateTime } from 'luxon';
import { computeAvailableSlots, formatSlot, type WorkingInterval } from './slot-engine';

// ---------------------------------------------------------------------------
// Testes do motor de slots. Puro, sem banco. Rode com `npm run test:engine`.
// Regra de ouro 3: se mexer no slot-engine, mantenha isto 100%.
// ---------------------------------------------------------------------------

const TZ = 'America/Sao_Paulo';
const DATE = '2026-03-16'; // uma segunda-feira

// weekday no padrão do motor: 0 = domingo ... 6 = sábado.
const WEEKDAY = DateTime.fromISO(DATE, { zone: TZ }).weekday % 7;

// Instante UTC a partir de um horário local "HH:mm" naquele dia.
function localInstant(hhmm: string): Date {
  return DateTime.fromISO(`${DATE}T${hhmm}`, { zone: TZ }).toJSDate();
}

// "now" bem antes do dia, pra antecedência mínima não filtrar (salvo no teste 3).
const NOW_ONTEM = DateTime.fromISO(DATE, { zone: TZ }).minus({ days: 1 }).toJSDate();

// Faixa de trabalho só de manhã: 9h-12h (540-720).
const manha: WorkingInterval[] = [{ weekday: WEEKDAY, startMinute: 540, endMinute: 720 }];

const tests: Array<[string, () => void]> = [
  [
    'manhã livre 9-12, serviço 30min, passo 30 -> 6 slots (09:00..11:30)',
    () => {
      const slots = computeAvailableSlots({
        date: DATE,
        timezone: TZ,
        durationMinutes: 30,
        slotStepMinutes: 30,
        minLeadMinutes: 0,
        workingHours: manha,
        busy: [],
        now: NOW_ONTEM,
      });
      assert.strictEqual(slots.length, 6);
      assert.strictEqual(formatSlot(slots[0], TZ), '09:00');
      assert.strictEqual(formatSlot(slots[5], TZ), '11:30');
    },
  ],
  [
    'um agendamento das 09:30 às 10:30 remove 09:30 e 10:00',
    () => {
      const slots = computeAvailableSlots({
        date: DATE,
        timezone: TZ,
        durationMinutes: 30,
        slotStepMinutes: 30,
        minLeadMinutes: 0,
        workingHours: manha,
        busy: [{ startAt: localInstant('09:30'), endAt: localInstant('10:30') }],
        now: NOW_ONTEM,
      });
      const labels = slots.map((s) => formatSlot(s, TZ));
      assert.deepStrictEqual(labels, ['09:00', '10:30', '11:00', '11:30']);
    },
  ],
  [
    'antecedência mínima de 120min a partir das 09:00 deixa só 11:00 e 11:30',
    () => {
      const slots = computeAvailableSlots({
        date: DATE,
        timezone: TZ,
        durationMinutes: 30,
        slotStepMinutes: 30,
        minLeadMinutes: 120,
        workingHours: manha,
        busy: [],
        now: localInstant('09:00'),
      });
      assert.deepStrictEqual(slots.map((s) => formatSlot(s, TZ)), ['11:00', '11:30']);
    },
  ],
  [
    'serviço de 45min não estoura o fim da faixa (último início cabe em 12:00)',
    () => {
      const slots = computeAvailableSlots({
        date: DATE,
        timezone: TZ,
        durationMinutes: 45,
        slotStepMinutes: 30,
        minLeadMinutes: 0,
        workingHours: manha,
        busy: [],
        now: NOW_ONTEM,
      });
      const ultimo = slots[slots.length - 1];
      // 11:00 + 45min = 11:45 (cabe); 11:30 + 45min = 12:15 (não cabe).
      assert.strictEqual(formatSlot(ultimo, TZ), '11:00');
    },
  ],
  [
    'dia sem horário de trabalho (outro weekday) -> nenhum slot',
    () => {
      const outroDia: WorkingInterval[] = [
        { weekday: (WEEKDAY + 1) % 7, startMinute: 540, endMinute: 720 },
      ];
      const slots = computeAvailableSlots({
        date: DATE,
        timezone: TZ,
        durationMinutes: 30,
        slotStepMinutes: 30,
        minLeadMinutes: 0,
        workingHours: outroDia,
        busy: [],
        now: NOW_ONTEM,
      });
      assert.strictEqual(slots.length, 0);
    },
  ],
  [
    'almoço: faixas 9-12 e 13-14 não geram slot dentro do intervalo 12-13',
    () => {
      const comAlmoco: WorkingInterval[] = [
        { weekday: WEEKDAY, startMinute: 540, endMinute: 720 }, // 9-12
        { weekday: WEEKDAY, startMinute: 780, endMinute: 840 }, // 13-14
      ];
      const slots = computeAvailableSlots({
        date: DATE,
        timezone: TZ,
        durationMinutes: 30,
        slotStepMinutes: 30,
        minLeadMinutes: 0,
        workingHours: comAlmoco,
        busy: [],
        now: NOW_ONTEM,
      });
      const labels = slots.map((s) => formatSlot(s, TZ));
      assert.ok(!labels.includes('12:00') && !labels.includes('12:30'), 'não deve ofertar no almoço');
      assert.deepStrictEqual(labels, ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30']);
    },
  ],
];

let passed = 0;
for (const [nome, fn] of tests) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    console.error(`  FALHOU  ${nome}`);
    console.error(`         ${(e as Error).message}`);
  }
}

console.log(`\nMotor de slots: ${passed}/${tests.length}`);
if (passed !== tests.length) process.exit(1);
