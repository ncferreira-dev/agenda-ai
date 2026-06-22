import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Sobe a "Barbearia do Zé" de teste: serviços, profissionais e horários.
// Idempotente por slug: se já existir, não recria (pra não apagar agendamentos
// de teste num segundo `npm run seed`).
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

// Horário comercial padrão. weekday: 0 = domingo ... 6 = sábado.
// Minutos desde 00:00 no fuso do negócio: 9h = 540, 12h = 720, 13h = 780, 18h = 1080.
const SEMANA = [1, 2, 3, 4, 5]; // seg a sex: 9-12 e 13-18
const SABADO = 6; // sábado: 9-13

async function main(): Promise<void> {
  const slug = 'barbearia-do-ze';

  const existente = await prisma.business.findUnique({ where: { slug } });
  if (existente) {
    console.log(`Seed: "${existente.name}" (${slug}) já existe — nada a fazer.`);
    return;
  }

  const business = await prisma.business.create({
    data: {
      name: 'Barbearia do Zé',
      slug,
      timezone: 'America/Sao_Paulo',
      phone: '5511999990000', // número de WhatsApp do negócio (placeholder)
    },
  });

  const corte = await prisma.service.create({
    data: { businessId: business.id, name: 'Corte', durationMinutes: 30, priceCents: 4000 },
  });
  const barba = await prisma.service.create({
    data: { businessId: business.id, name: 'Barba', durationMinutes: 20, priceCents: 2500 },
  });
  const combo = await prisma.service.create({
    data: { businessId: business.id, name: 'Corte + Barba', durationMinutes: 45, priceCents: 6000 },
  });

  // Dois profissionais; ambos executam todos os serviços.
  for (const nome of ['João', 'Maria']) {
    const pro = await prisma.professional.create({
      data: { businessId: business.id, name: nome },
    });

    await prisma.professionalService.createMany({
      data: [corte, barba, combo].map((s) => ({ professionalId: pro.id, serviceId: s.id })),
    });

    const faixas = [
      // Seg-Sex: manhã (9-12) e tarde (13-18), com almoço no meio.
      ...SEMANA.flatMap((weekday) => [
        { weekday, startMinute: 540, endMinute: 720 },
        { weekday, startMinute: 780, endMinute: 1080 },
      ]),
      // Sábado: 9-13.
      { weekday: SABADO, startMinute: 540, endMinute: 780 },
    ];

    await prisma.workingHour.createMany({
      data: faixas.map((f) => ({ professionalId: pro.id, ...f })),
    });
  }

  console.log(`Seed: "${business.name}" criado.`);
  console.log(`Página: http://localhost:3001/${slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
