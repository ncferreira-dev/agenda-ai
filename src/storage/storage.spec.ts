import assert from 'node:assert';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { StorageService, UPLOADS_DIR } from './storage.service';

// ---------------------------------------------------------------------------
// STORAGE DE IMAGENS — onde um arquivo que veio da internet vira um arquivo
// nosso, servido do NOSSO domínio.
//
// Duas coisas do arquivo são controladas por quem envia: o NOME e o TIPO. E a
// regra que segura tudo é uma só — a extensão sai de um allowlist do tipo, e
// nunca do nome. Se saísse do nome, "evil.html" continuaria .html; a API
// serviria o arquivo como HTML e o resultado é XSS hospedado no nosso domínio,
// com a sessão do dono do lado. SVG entra na mesma conta: é imagem de verdade
// e executa script.
//
// O nome também é a porta do path traversal: "../../.env.png" só não escapa da
// pasta de uploads porque a chave é um UUID novo e o nome original é jogado
// fora inteiro. Este arquivo prova as duas coisas escrevendo em disco de
// verdade e conferindo onde o arquivo foi parar.
// ---------------------------------------------------------------------------

// Sem isto o service avisa a cada chamada que caiu no fallback de dev — ruído
// que esconde o resultado do teste.
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL ?? 'http://localhost:3000';

const storage = new StorageService();

// A pasta de uploads pode ter arquivos de verdade do ambiente de dev. A limpeza
// no fim compara com esta foto e apaga só o que ESTE arquivo criou — inclusive
// o que um caminho de erro escreveu sem passar por `guardar`.
const jaExistiam = new Set(existsSync(UPLOADS_DIR) ? readdirSync(UPLOADS_DIR) : []);
const pastaExistiaAntes = existsSync(UPLOADS_DIR);

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function guardar(originalname: string, mimetype: string) {
  const { url } = await storage.put({ buffer: PNG_1x1, originalname, mimetype });
  const chave = basename(new URL(url, 'http://local').pathname);
  return { url, chave };
}

const tests: Array<[string, () => Promise<void>]> = [
  [
    'a extensão sai do TIPO, não do nome: "evil.html" enviado como PNG vira .png',
    async () => {
      const { chave } = await guardar('evil.html', 'image/png');
      assert.ok(chave.endsWith('.png'), `chave devia terminar em .png, veio ${chave}`);
      assert.ok(!chave.includes('.html'), 'o .html do nome não pode sobreviver na chave');
    },
  ],
  [
    'SVG é recusado (é imagem de verdade, e executa script)',
    async () => {
      await assert.rejects(
        () => storage.put({ buffer: PNG_1x1, originalname: 'logo.svg', mimetype: 'image/svg+xml' }),
        /não suportado/i,
        'SVG passou — isso é XSS servido do nosso domínio',
      );
    },
  ],
  [
    'tipo que não é imagem raster é recusado (PDF, HTML, texto)',
    async () => {
      for (const mimetype of ['application/pdf', 'text/html', 'text/plain', 'image/x-icon']) {
        await assert.rejects(
          () => storage.put({ buffer: PNG_1x1, originalname: 'a.png', mimetype }),
          /não suportado/i,
          `${mimetype} não podia passar`,
        );
      }
    },
  ],
  [
    'os quatro formatos aceitos ganham a extensão certa',
    async () => {
      const esperado: Array<[string, string]> = [
        ['image/png', '.png'],
        ['image/jpeg', '.jpg'],
        ['image/webp', '.webp'],
        ['image/gif', '.gif'],
      ];
      for (const [mimetype, ext] of esperado) {
        const { chave } = await guardar('qualquer-nome', mimetype);
        assert.ok(chave.endsWith(ext), `${mimetype} devia virar ${ext}, veio ${chave}`);
      }
    },
  ],
  [
    'nome com "../" não escapa da pasta de uploads',
    async () => {
      const { chave } = await guardar('../../.env.png', 'image/png');

      assert.ok(!chave.includes('..'), `a chave carregou "..": ${chave}`);
      assert.ok(!chave.includes('/'), `a chave carregou barra: ${chave}`);
      assert.ok(
        existsSync(join(UPLOADS_DIR, chave)),
        'o arquivo tinha que estar DENTRO da pasta de uploads',
      );
    },
  ],
  [
    'nada do nome original sobra na chave (nem o nome, nem a pista de quem enviou)',
    async () => {
      const { chave } = await guardar('foto-do-cpf-12345678900.png', 'image/png');
      assert.ok(!chave.includes('cpf'), `o nome original vazou pra URL pública: ${chave}`);
      assert.match(
        chave,
        /^[0-9a-f-]{36}\.png$/,
        `a chave devia ser um UUID + extensão, veio ${chave}`,
      );
    },
  ],
  [
    'dois envios com o MESMO nome não se sobrescrevem',
    async () => {
      const a = await guardar('logo.png', 'image/png');
      const b = await guardar('logo.png', 'image/png');

      assert.notStrictEqual(a.chave, b.chave, 'a segunda logo apagaria a primeira');
      assert.ok(existsSync(join(UPLOADS_DIR, a.chave)));
      assert.ok(existsSync(join(UPLOADS_DIR, b.chave)));
    },
  ],
  [
    'a URL devolvida é a pública de /uploads (é ela que vai pro banco e pra página)',
    async () => {
      const { url, chave } = await guardar('logo.png', 'image/png');
      assert.ok(url.startsWith('http'), `URL sem esquema: ${url}`);
      assert.ok(url.endsWith(`/uploads/${chave}`), `URL fora do padrão: ${url}`);
    },
  ],
];

function limpar() {
  if (!existsSync(UPLOADS_DIR)) return;
  for (const nome of readdirSync(UPLOADS_DIR)) {
    if (!jaExistiam.has(nome)) rmSync(join(UPLOADS_DIR, nome), { force: true });
  }
  // Se a pasta só passou a existir por causa deste teste, ela volta a não existir.
  if (!pastaExistiaAntes && readdirSync(UPLOADS_DIR).length === 0) {
    rmSync(UPLOADS_DIR, { recursive: true, force: true });
  }
}

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
  limpar();
  if (falhas > 0) {
    console.error(`\n${falhas} teste(s) falharam.`);
    process.exit(1);
  }
  console.log(`\n${tests.length} testes passaram.`);
}

void principal();
