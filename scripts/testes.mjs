#!/usr/bin/env node
// Roda TODOS os *.spec.ts de src/. Ele PROCURA os arquivos em vez de ter a
// lista escrita porque a lista escrita foi o defeito: havia sete scripts
// test:alguma-coisa no package.json, um por arquivo, e nenhum comando que
// rodasse o conjunto. Spec nova entrava no repositório sem entrar em lugar
// nenhum, e ninguém percebia — teste que ninguém roda é teste que não existe.
//
// Uso: node scripts/testes.mjs

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const IGNORAR = ['node_modules', 'dist', '.git', '.next'];

function procurarSpecs(dir) {
  const achados = [];
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.includes(nome)) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achados.push(...procurarSpecs(caminho));
    else if (nome.endsWith('.spec.ts')) achados.push(caminho);
  }
  return achados;
}

const specs = procurarSpecs(join(RAIZ, 'src')).sort();
if (specs.length === 0) {
  // Zero spec encontrada é falha, não sucesso: significa que a busca quebrou
  // (pasta renomeada, extensão mudada) e o verde seria vazio.
  console.error('Nenhum *.spec.ts encontrado em src/ — a busca quebrou?');
  process.exit(1);
}

console.log(`Rodando ${specs.length} suíte(s) de teste\n`);
const falhas = [];

for (const spec of specs) {
  const rel = relative(RAIZ, spec);
  const r = spawnSync('npx', ['ts-node', spec], { cwd: RAIZ, encoding: 'utf8', shell: false });
  const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  const resumo = saida.split('\n').filter(Boolean).pop() ?? '(sem saída)';
  if (r.status === 0) {
    console.log(`  ok    ${rel.padEnd(44)} ${resumo}`);
  } else {
    falhas.push(rel);
    console.log(`  FALHA ${rel}`);
    for (const linha of saida.split('\n').slice(-12)) console.log(`        ${linha}`);
  }
}

console.log('');
if (falhas.length > 0) {
  console.error(`${falhas.length} de ${specs.length} suíte(s) falharam.`);
  process.exit(1);
}
console.log(`${specs.length}/${specs.length} suítes passaram.`);
