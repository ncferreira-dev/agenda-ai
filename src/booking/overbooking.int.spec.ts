import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { execSync } from 'node:child_process';
import { BookingService } from './booking.service';
import { criarExtensaoAuditoria } from '../prisma/prisma-audit.extension';
import type { MailService } from '../mail/mail.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// ANTI-OVERBOOKING — teste de INTEGRAÇÃO, contra Postgres de verdade.
//
// É a única falha deste sistema que dá prejuízo direto e imediato: dois
// clientes marcados no mesmo horário, e um deles volta pra casa. A defesa tem
// duas camadas — o recheck dentro da transação e uma exclusion constraint gist
// no banco (appointment_no_overlap) — e NENHUMA das duas dava pra exercitar sem
// banco. Por isso este arquivo não é `.spec.ts` puro: ele precisa do Postgres.
//
// `npm run test:integracao` (o banco é preparado por scripts/banco-de-teste.mjs)
// ---------------------------------------------------------------------------

const URL_DE_TESTE = execSync('node scripts/banco-de-teste.mjs --url', { encoding: 'utf8' }).trim();

// Trava: o teste APAGA tabelas. Se a URL não terminar em _teste, ele não roda.
if (!/_teste(\?|$)/.test(URL_DE_TESTE)) {
  console.error(`Recusando rodar: a URL de teste precisa terminar em _teste (veio ${URL_DE_TESTE})`);
  process.exit(1);
}

const base = new PrismaClient({ datasources: { db: { url: URL_DE_TESTE } } });
// O cast é para PrismaService (a classe que a app injeta), e não para
// PrismaClient: o service tipa a dependência por ela. O client estendido tem
// tudo que o BookingService usa; o que falta são só os ganchos de ciclo de vida
// do Nest, que não existem fora da app.
const prisma = base.$extends(criarExtensaoAuditoria(base)) as unknown as PrismaService;

// Dublês: e-mail desligado e notificação sem efeito. O que se testa aqui é a
// transação, não os avisos — e um SMTP de verdade tornaria o teste lento e
// dependente de rede.
const mail = { enabled: false } as unknown as MailService;
const notifications = { notifyNewBooking: async () => undefined } as unknown as NotificationsService;
const booking = new BookingService(prisma, mail, notifications);

const TZ = 'America/Sao_Paulo';
const ids = {
  business: '00000000-0000-4000-8000-000000000001',
  pro: '00000000-0000-4000-8000-000000000002',
  pro2: '00000000-0000-4000-8000-000000000003',
  service: '00000000-0000-4000-8000-000000000004',
  customer: '00000000-0000-4000-8000-000000000005',
  customer2: '00000000-0000-4000-8000-000000000006',
};

/** Uma quarta-feira futura às 10:00 no fuso do negócio, alinhada à grade. */
function horarioAlvo(): string {
  let d = DateTime.now().setZone(TZ).plus({ days: 3 }).startOf('day').set({ hour: 10 });
  while (d.weekday !== 3) d = d.plus({ days: 1 });
  return d.toISO()!;
}

/**
 * O banco de teste TEM a constraint que este arquivo existe pra exercitar?
 *
 * Sem esta guarda, um banco que divergiu do schema faz os cinco outros testes
 * passarem e só o de corrida falhar — e a mensagem ("2 !== 1") manda investigar
 * o código, quando o problema é o banco. `migrate deploy` não reaplica migration
 * já marcada, então essa divergência NÃO se conserta rodando a preparação de
 * novo: precisa de `npm run banco:teste:recriar`.
 */
async function exigirConstraint() {
  const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'appointment_no_overlap'`,
  );
  if (Number(r[0]?.n ?? 0) === 0) {
    console.error(
      'O banco de teste NÃO tem a constraint appointment_no_overlap — ele divergiu do schema.\n' +
        'Conserte com: npm run banco:teste:recriar',
    );
    process.exit(1);
  }
}

async function limpar() {
  // Ordem importa: filhos antes dos pais.
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AuditLog","AppointmentItem","Appointment","WorkingHour","ProfessionalService","Customer","Service","Professional","Owner","Business" CASCADE',
  );
}

async function semear() {
  await limpar();
  await prisma.business.create({
    data: {
      id: ids.business,
      name: 'Barbearia de Teste',
      slug: 'barbearia-de-teste',
      timezone: TZ,
      slotStepMinutes: 15,
      minLeadMinutes: 60,
      maxAdvanceDays: 60,
    },
  });
  await prisma.service.create({
    data: { id: ids.service, businessId: ids.business, name: 'Corte', durationMinutes: 30, priceCents: 4000 },
  });
  for (const id of [ids.pro, ids.pro2]) {
    await prisma.professional.create({
      data: { id, businessId: ids.business, name: `Pro ${id.slice(-1)}` },
    });
    await prisma.professionalService.create({ data: { professionalId: id, serviceId: ids.service } });
    // Segunda a sexta, 09:00–18:00.
    for (const weekday of [1, 2, 3, 4, 5]) {
      await prisma.workingHour.create({
        data: { professionalId: id, weekday, startMinute: 540, endMinute: 1080 },
      });
    }
  }
  await prisma.customer.create({
    data: { id: ids.customer, businessId: ids.business, phone: '5511900000001', name: 'Cliente 1' },
  });
  await prisma.customer.create({
    data: { id: ids.customer2, businessId: ids.business, phone: '5511900000002', name: 'Cliente 2' },
  });
}

const agendar = (startAtIso: string, professionalId = ids.pro, customerId = ids.customer) =>
  booking.createAppointment({
    businessId: ids.business,
    customerId,
    professionalId,
    serviceId: ids.service,
    startAtIso,
  });

const tests: Array<[string, () => Promise<void>]> = [
  [
    'DUAS TENTATIVAS SIMULTÂNEAS no mesmo horário: exatamente uma vence',
    async () => {
      await semear();
      const quando = horarioAlvo();

      // Promise.all dispara as duas ANTES de qualquer uma terminar. É o que o
      // recheck sozinho não garante: as duas podem passar pela leitura antes de
      // a outra gravar, e aí só a constraint do banco segura.
      const r = await Promise.allSettled([
        agendar(quando, ids.pro, ids.customer),
        agendar(quando, ids.pro, ids.customer2),
      ]);

      const venceram = r.filter((x) => x.status === 'fulfilled');
      assert.strictEqual(venceram.length, 1, 'exatamente uma tentativa pode vencer');

      const gravados = await prisma.appointment.count({ where: { professionalId: ids.pro } });
      assert.strictEqual(gravados, 1, 'só pode existir UM agendamento no banco');
    },
  ],
  [
    'a segunda tentativa em sequência é recusada com 409',
    async () => {
      await semear();
      const quando = horarioAlvo();
      await agendar(quando);

      await assert.rejects(
        () => agendar(quando, ids.pro, ids.customer2),
        (e: { status?: number }) => e.status === 409,
        'conflito precisa virar 409, não 500',
      );
    },
  ],
  [
    'sobreposição PARCIAL também é barrada',
    async () => {
      // O serviço dura 30 min. Começar 15 min depois invade o mesmo bloco —
      // um teste que só cobrisse horário idêntico deixaria isto passar.
      await semear();
      const quando = DateTime.fromISO(horarioAlvo());
      await agendar(quando.toISO()!);

      await assert.rejects(
        () => agendar(quando.plus({ minutes: 15 }).toISO()!, ids.pro, ids.customer2),
        (e: { status?: number }) => e.status === 409,
      );
    },
  ],
  [
    'horários ENCOSTADOS cabem (o fim de um é o início do outro)',
    async () => {
      // tsrange é [) — início inclusivo, fim exclusivo. Se a constraint usasse
      // [] o dono perderia um slot legítimo a cada atendimento.
      await semear();
      const quando = DateTime.fromISO(horarioAlvo());
      await agendar(quando.toISO()!);
      await agendar(quando.plus({ minutes: 30 }).toISO()!, ids.pro, ids.customer2);

      const total = await prisma.appointment.count({ where: { professionalId: ids.pro } });
      assert.strictEqual(total, 2, 'dois atendimentos seguidos precisam caber');
    },
  ],
  [
    'o mesmo horário com OUTRO profissional é permitido',
    async () => {
      await semear();
      const quando = horarioAlvo();
      await agendar(quando, ids.pro);
      await agendar(quando, ids.pro2, ids.customer2);

      const total = await prisma.appointment.count();
      assert.strictEqual(total, 2);
    },
  ],
  [
    'cancelar LIBERA o horário',
    async () => {
      // A constraint só vale para PENDING/CONFIRMED. Sem esse WHERE, um
      // cancelamento deixaria o horário morto para sempre.
      await semear();
      const quando = horarioAlvo();
      const { appointment } = await agendar(quando);
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: 'CANCELLED' },
      });

      await agendar(quando, ids.pro, ids.customer2);
      const ativos = await prisma.appointment.count({
        where: { professionalId: ids.pro, status: { in: ['PENDING', 'CONFIRMED'] } },
      });
      assert.strictEqual(ativos, 1);
    },
  ],
];

async function principal() {
  await exigirConstraint();
  let falhas = 0;
  for (const [nome, fn] of tests) {
    try {
      await fn();
      console.log(`  ✓ ${nome}`);
    } catch (e) {
      falhas++;
      console.error(`  ✗ ${nome}`);
      console.error(`    ${(e as Error).message}`);
    }
  }
  await limpar();
  await base.$disconnect();
  if (falhas > 0) {
    console.error(`\n${falhas} teste(s) falharam.`);
    process.exit(1);
  }
  console.log(`\n${tests.length} testes passaram.`);
}

void principal();
