#!/usr/bin/env node
// Roda os *.int.spec.ts — os testes que precisam de Postgres de verdade.
//
// Prepara o banco antes (cria + migra) para o teste nunca ser o responsável por
// descobrir que o banco não existe: a mensagem sairia como falha de teste e
// mandaria investigar o código.
//
// Uso: npm run test:integracao

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const IGNORAR = ['node_modules', 'dist', '.git', '.next'];

function procurar(dir) {
  const achados = [];
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.includes(nome)) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achados.push(...procurar(caminho));
    else if (nome.endsWith('.int.spec.ts')) achados.push(caminho);
  }
  return achados;
}

const preparo = spawnSync('node', ['scripts/banco-de-teste.mjs'], {
  cwd: RAIZ, encoding: 'utf8', stdio: 'inherit',
});
if (preparo.status !== 0) {
  console.error('Não consegui preparar o banco de teste.');
  process.exit(1);
}

const specs = procurar(join(RAIZ, 'src')).sort();
if (specs.length === 0) {
  console.error('Nenhum *.int.spec.ts encontrado — a busca quebrou?');
  process.exit(1);
}

console.log(`\nRodando ${specs.length} suíte(s) de integração\n`);
const falhas = [];
for (const spec of specs) {
  const rel = relative(RAIZ, spec);
  const r = spawnSync('npx', ['ts-node', spec], { cwd: RAIZ, encoding: 'utf8' });
  const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  if (r.status === 0) {
    console.log(`  ok    ${rel.padEnd(40)} ${saida.split('\n').filter(Boolean).pop() ?? ''}`);
  } else {
    falhas.push(rel);
    console.log(`  FALHA ${rel}`);
    for (const linha of saida.split('\n').slice(-25)) console.log(`        ${linha}`);
  }
}

console.log('');
if (falhas.length) {
  console.error(`${falhas.length} de ${specs.length} suíte(s) falharam.`);
  process.exit(1);
}
console.log(`${specs.length}/${specs.length} suítes de integração passaram.`);
