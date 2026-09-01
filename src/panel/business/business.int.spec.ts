import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { BusinessService } from './business.service';
import { RESERVED_SLUGS, SLUG_MIN, SLUG_RE } from '../../common/slug';
import { criarExtensaoAuditoria } from '../../prisma/prisma-audit.extension';
import type { PrismaService } from '../../prisma/prisma.service';

// ---------------------------------------------------------------------------
// DADOS DO NEGÓCIO (painel) — integração, contra Postgres.
//
// updateBusiness é um método que recebe 27 campos opcionais e escreve num só
// update. Três coisas podem dar errado sem aparecer:
//
//  1. Escrever campo que não foi enviado (apagar o que o dono não tocou).
//  2. Deixar passar valor que o motor de horários não aguenta (fuso inválido,
//     passo de slot zerado).
//  3. O SLUG. Ele é a URL pública. Um slug reservado sequestra rota do app e um
//     slug repetido rouba a página de outro negócio.
//
// A lista de reservados já esteve duplicada aqui dentro e as duas cópias
// divergiram ('registro' era barrado no cadastro e liberado no painel). O
// primeiro teste varre a lista INTEIRA da fonte única — se alguém criar uma
// segunda cópia, ela não fica igual sozinha e o teste avisa.
// ---------------------------------------------------------------------------

const URL_DE_TESTE = execSync('node scripts/banco-de-teste.mjs --url', { encoding: 'utf8' }).trim();
if (!/_teste(\?|$)/.test(URL_DE_TESTE)) {
  console.error(`Recusando rodar: a URL precisa terminar em _teste (veio ${URL_DE_TESTE})`);
  process.exit(1);
}

const base = new PrismaClient({ datasources: { db: { url: URL_DE_TESTE } } });
const prisma = base.$extends(criarExtensaoAuditoria(base)) as unknown as PrismaService;
const service = new BusinessService(prisma);

const EU = '00000000-0000-4000-9000-000000000001';
const VIZINHO = '00000000-0000-4000-9000-000000000002';

async function limpar() {
  await prisma.$executeRawUnsafe('TRUNCATE "AuditLog","Service","Owner","Business" CASCADE');
}

async function semear() {
  await limpar();
  await prisma.business.create({
    data: {
      id: EU,
      name: 'Studio da Maria',
      slug: 'studio-da-maria',
      timezone: 'America/Sao_Paulo',
      about: 'Texto que já estava lá',
      accentColor: '#112233',
      serviceMode: 'PRESENCIAL',
      address: 'Rua A, 1',
    },
  });
  await prisma.business.create({
    data: { id: VIZINHO, name: 'Vizinho', slug: 'vizinho', timezone: 'America/Sao_Paulo' },
  });
}

const meu = () => prisma.business.findUniqueOrThrow({ where: { id: EU } });

const tests: Array<[string, () => Promise<void>]> = [
  [
    'NENHUM slug reservado passa pelo painel (a lista inteira, da fonte única)',
    async () => {
      await semear();
      for (const reservado of RESERVED_SLUGS) {
        await assert.rejects(
          () => service.updateBusiness(EU, { slug: reservado }),
          `"${reservado}" está na lista de reservados mas o painel deixou salvar`,
        );

        // Dois itens da lista ('b' e '_next') já são barrados antes, pelo
        // tamanho e pelo formato — a checagem de reservado nem chega neles.
        // Pros DEMAIS, o motivo tem que ser "é reservado": se um deles passar
        // a ser recusado por outro motivo, a proteção virou acidente.
        const chegaNaChecagem = SLUG_RE.test(reservado) && reservado.length >= SLUG_MIN;
        if (chegaNaChecagem) {
          await assert.rejects(
            () => service.updateBusiness(EU, { slug: reservado }),
            /reservado/i,
            `"${reservado}" foi recusado, mas não por ser reservado`,
          );
        }
      }
      assert.strictEqual((await meu()).slug, 'studio-da-maria');
    },
  ],
  [
    'slug de outro negócio é recusado (não dá pra roubar a página do vizinho)',
    async () => {
      await semear();
      await assert.rejects(() => service.updateBusiness(EU, { slug: 'vizinho' }), /já está em uso/i);
      assert.strictEqual((await meu()).slug, 'studio-da-maria');
      assert.strictEqual(
        (await prisma.business.findUniqueOrThrow({ where: { id: VIZINHO } })).slug,
        'vizinho',
      );
    },
  ],
  [
    'salvar o próprio slug de novo não colide consigo mesmo',
    async () => {
      await semear();
      const r = await service.updateBusiness(EU, { slug: 'studio-da-maria' });
      assert.strictEqual(r.slug, 'studio-da-maria');
    },
  ],
  [
    'slug fora do formato ou do tamanho é recusado com mensagem que o dono entende',
    async () => {
      await semear();
      for (const ruim of ['Com Maiúscula', 'com espaço', 'acentuação', '-inicio', 'fim-', 'du--plo', 'a/b']) {
        await assert.rejects(
          () => service.updateBusiness(EU, { slug: ruim }),
          /letras minúsculas/i,
          `"${ruim}" não podia passar`,
        );
      }
      await assert.rejects(() => service.updateBusiness(EU, { slug: 'ab' }), /entre 3 e 40/i);
      await assert.rejects(() => service.updateBusiness(EU, { slug: 'a'.repeat(41) }), /entre 3 e 40/i);
    },
  ],
  [
    'só o que foi enviado é escrito — o resto do negócio fica intacto',
    async () => {
      await semear();
      const antes = await meu();
      await service.updateBusiness(EU, { name: 'Studio Novo' });
      const depois = await meu();

      assert.strictEqual(depois.name, 'Studio Novo');
      assert.strictEqual(depois.about, antes.about, 'o "Sobre" não foi enviado e não pode sumir');
      assert.strictEqual(depois.accentColor, antes.accentColor);
      assert.strictEqual(depois.slug, antes.slug);
      assert.strictEqual(depois.address, antes.address);
    },
  ],
  [
    'o tipo de atendimento manda mais que os campos enviados na MESMA chamada',
    async () => {
      await semear();
      // O dono muda pra remoto e, na mesma tela, o endereço antigo ainda vai
      // junto no formulário. O ripple é aplicado por último de propósito.
      const r = await service.updateBusiness(EU, {
        serviceMode: 'REMOTO',
        address: 'Rua A, 1',
        meetingUrl: 'meet.google.com/xyz',
      });
      assert.strictEqual(r.address, null, 'remoto não guarda endereço');
      assert.strictEqual(r.meetingUrl, 'https://meet.google.com/xyz');

      const p = await service.updateBusiness(EU, {
        serviceMode: 'PRESENCIAL',
        address: 'Rua B, 2',
        meetingUrl: 'https://zoom.us/j/1',
      });
      assert.strictEqual(p.meetingUrl, null, 'presencial não guarda link de atendimento');
      assert.strictEqual(p.address, 'Rua B, 2');
    },
  ],
  [
    'tipo de atendimento inválido é recusado em vez de virar lixo no banco',
    async () => {
      await semear();
      await assert.rejects(
        () => service.updateBusiness(EU, { serviceMode: 'TELEPATIA' }),
        /Tipo de atendimento inválido/i,
      );
      assert.strictEqual((await meu()).serviceMode, 'PRESENCIAL');
    },
  ],
  [
    'fuso fora da lista é recusado (o motor de horários quebraria com fuso inválido)',
    async () => {
      await semear();
      await assert.rejects(
        () => service.updateBusiness(EU, { timezone: 'Europe/Lisboa' }),
        /Fuso horário inválido/i,
      );
      await assert.rejects(() => service.updateBusiness(EU, { timezone: '' }), /Fuso/i);
      assert.strictEqual((await meu()).timezone, 'America/Sao_Paulo');

      const ok = await service.updateBusiness(EU, { timezone: 'America/Manaus' });
      assert.strictEqual(ok.timezone, 'America/Manaus');
    },
  ],
  [
    'as faixas da agenda são respeitadas nas duas pontas',
    async () => {
      await semear();
      const foraDaFaixa: Array<[Record<string, number>, RegExp]> = [
        [{ slotStepMinutes: 4 }, /passo dos horários/i],
        [{ slotStepMinutes: 121 }, /passo dos horários/i],
        [{ minLeadMinutes: -1 }, /antecedência mínima/i],
        [{ maxAdvanceDays: 0 }, /janela de agendamento/i],
        [{ maxAdvanceDays: 366 }, /janela de agendamento/i],
        [{ reminderHoursBefore: 0 }, /lembrete/i],
        [{ reminderHoursBefore: 169 }, /lembrete/i],
        [{ inactiveDays: 6 }, /sumido/i],
        [{ recurringMinVisits: 1 }, /recorrente/i],
      ];
      for (const [campo, mensagem] of foraDaFaixa) {
        await assert.rejects(
          () => service.updateBusiness(EU, campo),
          mensagem,
          `${JSON.stringify(campo)} não podia passar`,
        );
      }
      // E o valor quebrado (não inteiro) também não entra.
      await assert.rejects(() => service.updateBusiness(EU, { slotStepMinutes: 15.5 }), /inteiro/i);

      const n = await meu();
      assert.strictEqual(n.slotStepMinutes, 15, 'nada disso podia ter sido gravado');
      assert.strictEqual(n.maxAdvanceDays, 60);
    },
  ],
  [
    'o WhatsApp do negócio segue a mesma regra do telefone do dono',
    async () => {
      await semear();
      // Este número é @unique e é por ele que o webhook do WhatsApp descobre
      // de qual negócio é a mensagem. Antes ele era normalizado à mão, sem
      // validar tamanho: "5" virava "555" e entrava no banco.
      for (const curtoDemais of ['5', '11', '119999']) {
        await assert.rejects(
          () => service.updateBusiness(EU, { phone: curtoDemais }),
          /WhatsApp do negócio inválido/i,
          `"${curtoDemais}" não podia entrar como WhatsApp do negócio`,
        );
      }
      await assert.rejects(() => service.updateBusiness(EU, { phone: '1'.repeat(14) }), /inválido/i);
      assert.strictEqual((await meu()).phone, null, 'nenhum desses podia ter sido gravado');
    },
  ],
  [
    'WhatsApp do negócio válido é gravado em E.164, com máscara ou sem',
    async () => {
      await semear();
      const comMascara = await service.updateBusiness(EU, { phone: '(11) 91234-5678' });
      assert.strictEqual(comMascara.phone, '5511912345678');

      const jaComDdi = await service.updateBusiness(EU, { phone: '5511912345678' });
      assert.strictEqual(jaComDdi.phone, '5511912345678', 'não pode ganhar um segundo 55');

      // 10 dígitos é o piso da regra: fixo com DDD, sem o 9.
      const fixo = await service.updateBusiness(EU, { phone: '1133334444' });
      assert.strictEqual(fixo.phone, '551133334444');

      const limpo = await service.updateBusiness(EU, { phone: '' });
      assert.strictEqual(limpo.phone, null, 'vazio limpa o número, não vira "55"');
    },
  ],
  [
    'a mensagem diz QUAL dos dois WhatsApp está errado',
    async () => {
      await semear();
      // Os dois campos usam a mesma função. Sem o rótulo, os dois devolviam
      // "Telefone inválido." e o dono não sabia qual arrumar.
      await assert.rejects(
        () => service.updateBusiness(EU, { phone: '5' }),
        /WhatsApp do negócio/i,
      );
      await assert.rejects(
        () => service.updateBusiness(EU, { ownerWhatsApp: '5' }),
        /WhatsApp para avisos/i,
      );
    },
  ],
  [
    'gasto mínimo de VIP: null limpa a regra, negativo é recusado',
    async () => {
      await semear();
      await assert.rejects(
        () => service.updateBusiness(EU, { vipMinSpentCents: -1 }),
        /centavos/i,
      );
      const com = await service.updateBusiness(EU, { vipMinSpentCents: 50_000 });
      assert.strictEqual(com.vipMinSpentCents, 50_000);
      const sem = await service.updateBusiness(EU, { vipMinSpentCents: null });
      assert.strictEqual(sem.vipMinSpentCents, null, 'null tem que limpar a regra, não ser ignorado');
    },
  ],
  [
    'campo de texto vazio LIMPA em vez de gravar string vazia',
    async () => {
      await semear();
      const r = await service.updateBusiness(EU, {
        about: '   ',
        accentColor: '',
        instagramUrl: '',
        profession: '',
        themePreset: '',
      });
      assert.strictEqual(r.about, null);
      assert.strictEqual(r.accentColor, null);
      assert.strictEqual(r.instagramUrl, null);
      assert.strictEqual(r.profession, null);
      assert.strictEqual(r.themePreset, null);
    },
  ],
  [
    'branding inválido é recusado: cor fora do hex, URL sem http, tema inexistente',
    async () => {
      await semear();
      await assert.rejects(() => service.updateBusiness(EU, { accentColor: 'azul' }), /Cor inválida/i);
      await assert.rejects(() => service.updateBusiness(EU, { accentColor: '#FFF' }), /Cor inválida/i);
      await assert.rejects(
        () => service.updateBusiness(EU, { instagramUrl: 'instagram.com/eu' }),
        /URL inválida/i,
      );
      await assert.rejects(() => service.updateBusiness(EU, { themePreset: 'neon' }), /Tema inválido/i);
      await assert.rejects(
        () => service.updateBusiness(EU, { about: 'a'.repeat(801) }),
        /muito longo/i,
      );
      await assert.rejects(() => service.updateBusiness(EU, { name: '   ' }), /não pode ficar vazio/i);

      // E a cor válida é guardada em maiúsculas (formato único no banco).
      const ok = await service.updateBusiness(EU, { accentColor: '#a6432b' });
      assert.strictEqual(ok.accentColor, '#A6432B');
    },
  ],
  [
    'aplicar um vertical duas vezes não duplica serviço nem mexe no que o dono editou',
    async () => {
      await semear();
      const primeira = await service.applyVertical(EU, 'barbearia');
      assert.ok(primeira.created > 0, 'a primeira aplicação precisa criar os serviços-base');

      // O dono renomeia o preço de um serviço criado pelo preset.
      const algum = await prisma.service.findFirstOrThrow({ where: { businessId: EU } });
      await prisma.service.update({ where: { id: algum.id }, data: { priceCents: 12_345 } });

      const segunda = await service.applyVertical(EU, 'barbearia');
      assert.strictEqual(segunda.created, 0, 'reaplicar não pode criar de novo');
      assert.strictEqual(segunda.skipped, primeira.created);

      const total = await prisma.service.count({ where: { businessId: EU } });
      assert.strictEqual(total, primeira.created, 'a lista de serviços não pode ter dobrado');
      const depois = await prisma.service.findUniqueOrThrow({ where: { id: algum.id } });
      assert.strictEqual(depois.priceCents, 12_345, 'reaplicar não pode desfazer a edição do dono');
    },
  ],
  [
    'vertical inexistente é recusado e não cria serviço nenhum',
    async () => {
      await semear();
      await assert.rejects(() => service.applyVertical(EU, 'astrologia'), /Vertical inválido/i);
      assert.strictEqual(await prisma.service.count({ where: { businessId: EU } }), 0);
    },
  ],
  [
    'aplicar vertical e concluir onboarding só mexem no negócio de quem chamou',
    async () => {
      await semear();
      await service.applyVertical(EU, 'barbearia');
      await service.finishOnboarding(EU);

      const eu = await meu();
      const vizinho = await prisma.business.findUniqueOrThrow({ where: { id: VIZINHO } });
      assert.ok(eu.onboardedAt, 'o onboarding do dono precisa ficar marcado');
      assert.strictEqual(vizinho.onboardedAt, null, 'o vizinho não pode ter sido tocado');
      assert.strictEqual(vizinho.profession, null);
      assert.strictEqual(await prisma.service.count({ where: { businessId: VIZINHO } }), 0);
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
