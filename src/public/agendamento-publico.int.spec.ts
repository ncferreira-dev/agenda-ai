import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import { execSync } from 'node:child_process';
import { PublicBookingController } from './public-booking.controller';
import { BookingService } from '../booking/booking.service';
import { criarTokenDoCliente } from './customer-token';
import { criarExtensaoAuditoria } from '../prisma/prisma-audit.extension';
import type { PrismaService } from '../prisma/prisma.service';
import type { MailService } from '../mail/mail.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { AvailabilityService } from '../availability/availability.service';

// ---------------------------------------------------------------------------
// API PÚBLICA DO CLIENTE — integração, contra Postgres.
//
// É a superfície que qualquer um na internet alcança sem login. Não há sessão:
// quem agendou recebe um token assinado, e é ele que responde "quem é você".
// Duas perguntas decidem se isso é seguro, e as duas são de dado, não de UI:
//
//  1. O token de UM negócio vale no negócio do lado? Se valer, o link que um
//     cliente do salão A guardou no navegador abre a agenda do salão B.
//  2. Dá pra cancelar o que não é seu — ou o que já aconteceu? Cancelar um
//     atendimento já COMPLETED não desmarca nada: tira do faturamento do dono
//     um serviço que já foi feito e pago.
//
// A página pública também é uma resposta JSON: o que entra no `select` vaza pra
// internet. Telefone e CPF do profissional ficam fora — e isso tem teste.
// ---------------------------------------------------------------------------

const URL_DE_TESTE = execSync('node scripts/banco-de-teste.mjs --url', { encoding: 'utf8' }).trim();
if (!/_teste(\?|$)/.test(URL_DE_TESTE)) {
  console.error(`Recusando rodar: a URL precisa terminar em _teste (veio ${URL_DE_TESTE})`);
  process.exit(1);
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste-para-o-publico';

const base = new PrismaClient({ datasources: { db: { url: URL_DE_TESTE } } });
const prisma = base.$extends(criarExtensaoAuditoria(base)) as unknown as PrismaService;

const mail = { enabled: false } as unknown as MailService;
const notifications = { notifyNewBooking: async () => undefined } as unknown as NotificationsService;
const booking = new BookingService(prisma, mail, notifications);
// Disponibilidade tem motor próprio e suíte própria (slot-engine); aqui ela não
// entra em nenhum caminho testado.
const availability = {} as unknown as AvailabilityService;
const api = new PublicBookingController(prisma, availability, booking);

const TZ = 'America/Sao_Paulo';

interface Salao {
  business: string;
  pro: string;
  service: string;
  cliente: string;
  slug: string;
}

const A: Salao & { outroCliente: string } = {
  business: '00000000-0000-4000-7000-000000000001',
  pro: '00000000-0000-4000-7000-000000000002',
  service: '00000000-0000-4000-7000-000000000003',
  cliente: '00000000-0000-4000-7000-000000000004',
  outroCliente: '00000000-0000-4000-7000-000000000005',
  slug: 'salao-a',
};
const B: Salao = {
  business: '00000000-0000-4000-7000-000000000011',
  pro: '00000000-0000-4000-7000-000000000012',
  service: '00000000-0000-4000-7000-000000000013',
  cliente: '00000000-0000-4000-7000-000000000014',
  slug: 'salao-b',
};

async function limpar() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AuditLog","AppointmentItem","Appointment","RecurringBlock","WorkingHour",' +
      '"ProfessionalService","Customer","Service","Professional","Owner","Business" CASCADE',
  );
}

async function montarSalao(s: Salao) {
  await prisma.business.create({
    data: { id: s.business, name: `Salão ${s.slug}`, slug: s.slug, timezone: TZ, minLeadMinutes: 60 },
  });
  await prisma.service.create({
    data: { id: s.service, businessId: s.business, name: 'Corte', durationMinutes: 30, priceCents: 4000 },
  });
  await prisma.professional.create({
    data: { id: s.pro, businessId: s.business, name: 'Ana', phone: '5511988887777' },
  });
  await prisma.professionalService.create({ data: { professionalId: s.pro, serviceId: s.service } });
  for (const weekday of [1, 2, 3, 4, 5]) {
    await prisma.workingHour.create({
      data: { professionalId: s.pro, weekday, startMinute: 540, endMinute: 1080 },
    });
  }
  await prisma.customer.create({
    data: { id: s.cliente, businessId: s.business, phone: '5511900000001', name: 'Cliente' },
  });
}

async function semear() {
  await limpar();
  await montarSalao(A);
  await montarSalao(B);
  await prisma.customer.create({
    data: { id: A.outroCliente, businessId: A.business, phone: '5511900000009', name: 'Outro' },
  });
}

/** Uma quarta-feira futura às 10:00 no fuso do negócio. */
function quartaAs10(plusDays = 3): string {
  let d = DateTime.now().setZone(TZ).plus({ days: plusDays }).startOf('day').set({ hour: 10 });
  while (d.weekday !== 3) d = d.plus({ days: 1 });
  return d.toISO()!;
}

const tokenDe = (businessId: string, customerId: string) =>
  criarTokenDoCliente({ businessId, customerId }, process.env.JWT_SECRET!);

const agendar = (s: Salao, customerId: string, quando = quartaAs10()) =>
  booking.createAppointment({
    businessId: s.business,
    customerId,
    professionalId: s.pro,
    serviceId: s.service,
    startAtIso: quando,
  });

const tests: Array<[string, () => Promise<void>]> = [
  [
    'slug que não existe devolve 404 em vez de abrir uma página vazia',
    async () => {
      await semear();
      await assert.rejects(() => api.getBusinessPage('nao-existe'), /não encontrado/i);
      await assert.rejects(
        () => api.myAppointments('nao-existe', { token: tokenDe(A.business, A.cliente) }),
        /não encontrado/i,
      );
    },
  ],
  [
    'a página pública NÃO devolve telefone nem CPF do profissional',
    async () => {
      await semear();
      const pagina = await api.getBusinessPage(A.slug);
      const json = JSON.stringify(pagina);

      assert.ok(!json.includes('5511988887777'), 'o telefone do profissional vazou no JSON público');
      for (const p of pagina.professionals) {
        assert.deepStrictEqual(
          Object.keys(p).sort(),
          ['id', 'name', 'photoUrl', 'serviceIds'],
          'campo novo entrou na resposta pública sem passar por aqui',
        );
      }
    },
  ],
  [
    'serviço e profissional desativados somem da página pública',
    async () => {
      await semear();
      await prisma.service.update({ where: { id: A.service }, data: { active: false } });
      await prisma.professional.update({ where: { id: A.pro }, data: { active: false } });

      const pagina = await api.getBusinessPage(A.slug);
      assert.deepStrictEqual(pagina.services, []);
      assert.deepStrictEqual(pagina.professionals, []);
    },
  ],
  [
    'a página de um salão não mostra o serviço do salão do lado',
    async () => {
      await semear();
      const pagina = await api.getBusinessPage(A.slug);
      assert.strictEqual(pagina.services.length, 1);
      assert.strictEqual(pagina.services[0].id, A.service);
      assert.strictEqual(pagina.professionals[0].id, A.pro);
    },
  ],
  [
    'quem agenda recebe um token que abre os PRÓPRIOS agendamentos',
    async () => {
      await semear();
      const r = await api.createBooking(A.slug, {
        serviceId: A.service,
        professionalId: A.pro,
        startAt: quartaAs10(),
        name: 'Joana',
        phone: '11912345678',
      });
      assert.ok(r.accessToken, 'o agendamento precisa devolver a credencial');

      const lista = await api.myAppointments(A.slug, { token: r.accessToken });
      assert.strictEqual(lista.length, 1);
      assert.strictEqual(lista[0].id, r.id);
      assert.strictEqual(lista[0].service, 'Corte');
    },
  ],
  [
    'TOKEN DO SALÃO A NÃO VALE NO SALÃO B (mesmo sendo uma assinatura válida)',
    async () => {
      await semear();
      await agendar(A, A.cliente);
      const token = tokenDe(A.business, A.cliente);

      // A assinatura é legítima — o que barra é o negócio de origem gravado nela.
      await assert.rejects(
        () => api.myAppointments(B.slug, { token }),
        /inválido ou expirado/i,
        'token de um negócio abriu a agenda de outro',
      );
    },
  ],
  [
    'token adulterado, vazio ou de outra chave é recusado',
    async () => {
      await semear();
      const bom = tokenDe(A.business, A.cliente);
      const adulterado = bom.slice(0, -4) + 'aaaa';

      for (const ruim of [adulterado, '', 'qualquer-coisa', bom.toUpperCase()]) {
        await assert.rejects(
          () => api.myAppointments(A.slug, { token: ruim }),
          /inválido ou expirado/i,
          `token "${ruim.slice(0, 12)}…" não podia passar`,
        );
      }

      const outraChave = criarTokenDoCliente(
        { businessId: A.business, customerId: A.cliente },
        'outra-chave-qualquer',
      );
      await assert.rejects(
        () => api.myAppointments(A.slug, { token: outraChave }),
        /inválido ou expirado/i,
      );
    },
  ],
  [
    'o cliente vê os agendamentos dele, não os do vizinho de balcão',
    async () => {
      await semear();
      const meu = await agendar(A, A.cliente, quartaAs10());
      await agendar(A, A.outroCliente, quartaAs10(10));

      const lista = await api.myAppointments(A.slug, { token: tokenDe(A.business, A.cliente) });
      assert.strictEqual(lista.length, 1);
      assert.strictEqual(lista[0].id, meu.appointment.id);
    },
  ],
  [
    'cancelar o próprio agendamento futuro funciona',
    async () => {
      await semear();
      const { appointment } = await agendar(A, A.cliente);

      const r = await api.cancelMine(A.slug, appointment.id, {
        token: tokenDe(A.business, A.cliente),
      });
      assert.deepStrictEqual(r, { id: appointment.id, cancelled: true });

      const depois = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      assert.strictEqual(depois.status, 'CANCELLED');
    },
  ],
  [
    'ninguém cancela o agendamento de outro cliente (e a resposta não confirma que ele existe)',
    async () => {
      await semear();
      const alheio = await agendar(A, A.outroCliente);

      await assert.rejects(
        () => api.cancelMine(A.slug, alheio.appointment.id, { token: tokenDe(A.business, A.cliente) }),
        /não encontrado/i,
      );
      const depois = await prisma.appointment.findUniqueOrThrow({
        where: { id: alheio.appointment.id },
      });
      assert.notStrictEqual(depois.status, 'CANCELLED', 'o agendamento alheio foi cancelado');
    },
  ],
  [
    'atendimento JÁ CONCLUÍDO não pode ser "cancelado" (isso tirava do faturamento do dono)',
    async () => {
      await semear();
      const { appointment } = await agendar(A, A.cliente);
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: 'COMPLETED' },
      });

      await assert.rejects(
        () => api.cancelMine(A.slug, appointment.id, { token: tokenDe(A.business, A.cliente) }),
        /não pode mais ser cancelado/i,
      );
      const depois = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      assert.strictEqual(depois.status, 'COMPLETED');
    },
  ],
  [
    'agendamento no passado não pode ser cancelado depois do horário',
    async () => {
      await semear();
      const { appointment } = await agendar(A, A.cliente);
      // Empurra pro passado sem passar pelo service (que recusaria criar assim).
      const ontem = DateTime.now().setZone(TZ).minus({ days: 1 }).set({ hour: 10 }).toJSDate();
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { startAt: ontem, endAt: new Date(ontem.getTime() + 30 * 60_000) },
      });

      await assert.rejects(
        () => api.cancelMine(A.slug, appointment.id, { token: tokenDe(A.business, A.cliente) }),
        /não pode mais ser cancelado/i,
      );
    },
  ],
  [
    'token de outro negócio não cancela agendamento daqui',
    async () => {
      await semear();
      const { appointment } = await agendar(A, A.cliente);

      await assert.rejects(
        () => api.cancelMine(A.slug, appointment.id, { token: tokenDe(B.business, B.cliente) }),
        /inválido ou expirado/i,
      );
      const depois = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      assert.notStrictEqual(depois.status, 'CANCELLED');
    },
  ],
  [
    'o telefone é normalizado no servidor: formatos diferentes são o MESMO cliente',
    async () => {
      await semear();
      const antes = await prisma.customer.count({ where: { businessId: A.business } });

      // Máscara do teclado do celular. Sem tirar os símbolos, isso vira o
      // "telefone" 55(11) 91234-5678 e nasce um cliente que nunca mais casa
      // com ninguém — nem com a própria pessoa no agendamento seguinte.
      await api.createBooking(A.slug, {
        serviceId: A.service,
        professionalId: A.pro,
        startAt: quartaAs10(),
        name: 'Joana',
        phone: '(11) 91234-5678',
      });
      await api.createBooking(A.slug, {
        serviceId: A.service,
        professionalId: A.pro,
        startAt: quartaAs10(10),
        name: 'Joana',
        phone: '5511912345678',
      });

      const depois = await prisma.customer.count({ where: { businessId: A.business } });
      assert.strictEqual(depois, antes + 1, 'o mesmo número em dois formatos criou dois clientes');
      const c = await prisma.customer.findFirstOrThrow({
        where: { businessId: A.business, phone: '5511912345678' },
      });
      assert.strictEqual(c.phone, '5511912345678', 'o telefone é gravado em E.164');
    },
  ],
  [
    'dia coberto por bloqueio do negócio inteiro aparece como fechado na página',
    async () => {
      await semear();
      // Quarta (3) fechada: bloqueio do negócio cobre o expediente todo.
      await prisma.recurringBlock.create({
        data: { businessId: A.business, professionalId: null, weekday: 3, startMinute: 540, endMinute: 1080 },
      });
      // Terça (2) com bloqueio só de manhã: não é dia fechado.
      await prisma.recurringBlock.create({
        data: { businessId: A.business, professionalId: null, weekday: 2, startMinute: 540, endMinute: 720 },
      });

      const pagina = await api.getBusinessPage(A.slug);
      assert.deepStrictEqual(
        pagina.business.closedWeekdays,
        [3],
        'só o dia com o expediente inteiro coberto pode aparecer como fechado',
      );
    },
  ],
  [
    'domingo (sem expediente) não conta como "fechado por bloqueio"',
    async () => {
      await semear();
      const pagina = await api.getBusinessPage(A.slug);
      assert.deepStrictEqual(
        pagina.business.closedWeekdays,
        [],
        'dia sem expediente já nasce vazio; marcar como fechado seria outra coisa',
      );
    },
  ],
];

async function principal() {
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
