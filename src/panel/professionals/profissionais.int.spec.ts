import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { ProfessionalsService } from './professionals.service';
import { criarExtensaoAuditoria } from '../../prisma/prisma-audit.extension';
import type { PrismaService } from '../../prisma/prisma.service';

// ---------------------------------------------------------------------------
// PROFISSIONAIS — integração, contra Postgres.
//
// Este service tinha QUATRO cópias privadas das normalizações do painel
// (telefone, e-mail, CPF, URL). Três eram idênticas às comuns. Cópia de regra
// não fica igual sozinha: foi assim que a lista de slugs reservados divergiu, e
// foi assim que o telefone do negócio ficou sem validar tamanho.
//
// As três foram apagadas e apontadas pros comuns. O que era de fato diferente
// aqui — campo ausente vira null em vez de erro — sobrou num helper de uma
// linha, e é a primeira coisa que estes testes seguram: se o `undefined` virar
// erro, cadastrar profissional só com o nome para de funcionar.
// ---------------------------------------------------------------------------

const URL_DE_TESTE = execSync('node scripts/banco-de-teste.mjs --url', { encoding: 'utf8' }).trim();
if (!/_teste(\?|$)/.test(URL_DE_TESTE)) {
  console.error(`Recusando rodar: a URL precisa terminar em _teste (veio ${URL_DE_TESTE})`);
  process.exit(1);
}

const base = new PrismaClient({ datasources: { db: { url: URL_DE_TESTE } } });
const prisma = base.$extends(criarExtensaoAuditoria(base)) as unknown as PrismaService;
const service = new ProfessionalsService(prisma);

const EU = '00000000-0000-4000-6000-000000000001';
const VIZINHO = '00000000-0000-4000-6000-000000000002';

async function limpar() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AuditLog","ProfessionalService","Professional","Service","Owner","Business" CASCADE',
  );
}

async function semear() {
  await limpar();
  await prisma.business.create({ data: { id: EU, name: 'Meu', slug: 'meu-negocio' } });
  await prisma.business.create({ data: { id: VIZINHO, name: 'Vizinho', slug: 'vizinho' } });
}

const buscar = (id: string) => prisma.professional.findUniqueOrThrow({ where: { id } });

const tests: Array<[string, () => Promise<void>]> = [
  [
    'cadastrar só com o nome funciona (campo ausente vira vazio, não erro)',
    async () => {
      await semear();
      const pro = await service.create(EU, { name: 'Ana Souza' });

      const salvo = await buscar(pro.id);
      assert.strictEqual(salvo.name, 'Ana Souza');
      assert.strictEqual(salvo.phone, null);
      assert.strictEqual(salvo.email, null);
      assert.strictEqual(salvo.cpf, null);
      assert.strictEqual(salvo.photoUrl, null);
    },
  ],
  [
    'telefone segue a mesma regra do resto do painel, e diz de quem é',
    async () => {
      await semear();
      for (const ruim of ['5', '11', '1'.repeat(14)]) {
        await assert.rejects(
          () => service.create(EU, { name: 'Ana', phone: ruim }),
          /Telefone do profissional inválido/i,
          `"${ruim}" não podia entrar`,
        );
      }

      const pro = await service.create(EU, { name: 'Ana', phone: '(11) 91234-5678' });
      assert.strictEqual((await buscar(pro.id)).phone, '5511912345678');
    },
  ],
  [
    'e-mail é normalizado em minúsculas e o torto é recusado',
    async () => {
      await semear();
      await assert.rejects(() => service.create(EU, { name: 'Ana', email: 'sem-arroba' }), /E-mail/i);

      const pro = await service.create(EU, { name: 'Ana', email: '  Ana@Teste.COM ' });
      assert.strictEqual((await buscar(pro.id)).email, 'ana@teste.com');
    },
  ],
  [
    'CPF usa o mesmo validador do dono: dígito verificador confere',
    async () => {
      await semear();
      // 111.111.111-11 é sequência repetida; 123.456.789-00 tem DV errado.
      for (const ruim of ['11111111111', '12345678900', '123']) {
        await assert.rejects(
          () => service.create(EU, { name: 'Ana', cpf: ruim }),
          /CPF inválido/i,
          `"${ruim}" não podia entrar`,
        );
      }

      // CPF com DV válido, com máscara: entra só com dígitos.
      const pro = await service.create(EU, { name: 'Ana', cpf: '529.982.247-25' });
      assert.strictEqual((await buscar(pro.id)).cpf, '52998224725');
    },
  ],
  [
    'campo vazio LIMPA em vez de gravar string vazia ou "55"',
    async () => {
      await semear();
      const pro = await service.create(EU, {
        name: 'Ana',
        phone: '11912345678',
        email: 'ana@teste.com',
      });
      await service.update(EU, pro.id, { phone: '', email: '' });

      const salvo = await buscar(pro.id);
      assert.strictEqual(salvo.phone, null, 'vazio não pode virar "55"');
      assert.strictEqual(salvo.email, null);
    },
  ],
  [
    'editar só um campo não apaga os outros',
    async () => {
      await semear();
      const pro = await service.create(EU, {
        name: 'Ana',
        phone: '11912345678',
        email: 'ana@teste.com',
      });
      await service.update(EU, pro.id, { name: 'Ana Souza' });

      const salvo = await buscar(pro.id);
      assert.strictEqual(salvo.name, 'Ana Souza');
      assert.strictEqual(salvo.phone, '5511912345678');
      assert.strictEqual(salvo.email, 'ana@teste.com');
    },
  ],
  [
    'profissional do vizinho não é editável daqui',
    async () => {
      await semear();
      const dele = await service.create(VIZINHO, { name: 'Do Vizinho' });

      await assert.rejects(
        () => service.update(EU, dele.id, { name: 'Sequestrado' }),
        /não encontrado/i,
      );
      assert.strictEqual((await buscar(dele.id)).name, 'Do Vizinho');
    },
  ],
  [
    'nome vazio é recusado (a agenda mostra o profissional pelo nome)',
    async () => {
      await semear();
      await assert.rejects(() => service.create(EU, { name: '   ' }), /obrigatório/i);
      assert.strictEqual(await prisma.professional.count(), 0);
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
