import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

// ---------------------------------------------------------------------------
// Sobe negócios de teste com dono (login do painel), serviços, profissionais e
// horários. Idempotente: rodar de novo não duplica nem apaga agendamentos.
//   - "Barbearia do Zé" (slug barbearia-do-ze) — negócio principal de teste.
//   - "Salão da Carol" (slug salao-da-carol)  — 2º negócio, p/ provar que o
//     token de um dono NUNCA enxerga dados do outro (isolamento multi-tenant).
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

// Horário comercial padrão. weekday: 0 = domingo ... 6 = sábado.
// Minutos desde 00:00 no fuso do negócio: 9h = 540, 12h = 720, 13h = 780, 18h = 1080.
const SEMANA = [1, 2, 3, 4, 5]; // seg a sex: 9-12 e 13-18
const SABADO = 6; // sábado: 9-13

const HORARIO_PADRAO = [
  ...SEMANA.flatMap((weekday) => [
    { weekday, startMinute: 540, endMinute: 720 },
    { weekday, startMinute: 780, endMinute: 1080 },
  ]),
  { weekday: SABADO, startMinute: 540, endMinute: 780 },
];

/** Cria o negócio + serviços + profissionais + horários se ainda não existir. */
async function ensureBusiness(params: {
  slug: string;
  name: string;
  phone: string;
  servicos: { name: string; durationMinutes: number; priceCents: number }[];
  profissionais: string[];
}) {
  const existente = await prisma.business.findUnique({ where: { slug: params.slug } });
  if (existente) {
    console.log(`Negócio "${existente.name}" (${params.slug}) já existe.`);
    return existente;
  }

  const business = await prisma.business.create({
    data: {
      name: params.name,
      slug: params.slug,
      timezone: 'America/Sao_Paulo',
      phone: params.phone,
    },
  });

  const servicos = [];
  for (const s of params.servicos) {
    servicos.push(await prisma.service.create({ data: { businessId: business.id, ...s } }));
  }

  for (const nome of params.profissionais) {
    const pro = await prisma.professional.create({
      data: { businessId: business.id, name: nome },
    });
    await prisma.professionalService.createMany({
      data: servicos.map((s) => ({ professionalId: pro.id, serviceId: s.id })),
    });
    await prisma.workingHour.createMany({
      data: HORARIO_PADRAO.map((f) => ({ professionalId: pro.id, ...f })),
    });
  }

  console.log(`Negócio "${business.name}" criado. Página: http://localhost:3001/${params.slug}`);
  return business;
}

/** Cria/atualiza o dono do negócio (login do painel). Idempotente por email. */
async function ensureOwner(params: {
  businessId: string;
  email: string;
  name: string;
  senha: string;
}) {
  const passwordHash = await argon2.hash(params.senha);
  await prisma.owner.upsert({
    where: { email: params.email },
    create: {
      businessId: params.businessId,
      email: params.email,
      name: params.name,
      passwordHash,
    },
    update: { passwordHash, name: params.name, businessId: params.businessId },
  });
  console.log(`Dono: ${params.email} / senha "${params.senha}"`);
}

async function main(): Promise<void> {
  const barbearia = await ensureBusiness({
    slug: 'barbearia-do-ze',
    name: 'Barbearia do Zé',
    phone: '5511999990000',
    servicos: [
      { name: 'Corte', durationMinutes: 30, priceCents: 4000 },
      { name: 'Barba', durationMinutes: 20, priceCents: 2500 },
      { name: 'Corte + Barba', durationMinutes: 45, priceCents: 6000 },
    ],
    profissionais: ['João', 'Maria'],
  });
  await ensureOwner({
    businessId: barbearia.id,
    email: 'ze@barbearia.com',
    name: 'Zé',
    senha: 'senha123',
  });

  // 2º negócio, pra provar isolamento entre tenants.
  const salao = await ensureBusiness({
    slug: 'salao-da-carol',
    name: 'Salão da Carol',
    phone: '5511988880000',
    servicos: [
      { name: 'Manicure', durationMinutes: 40, priceCents: 5000 },
      { name: 'Escova', durationMinutes: 60, priceCents: 8000 },
    ],
    profissionais: ['Carol'],
  });
  await ensureOwner({
    businessId: salao.id,
    email: 'carol@salao.com',
    name: 'Carol',
    senha: 'senha123',
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
