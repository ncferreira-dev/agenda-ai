#!/usr/bin/env node
// Prepara o banco dos testes de integração: cria (se não existir) e aplica as
// migrations. Idempotente — pode rodar quantas vezes quiser.
//
// A URL sai da DATABASE_URL do ambiente com o NOME DO BANCO TROCADO por
// <nome>_teste. É deliberado, e é a trava mais importante deste arquivo:
// derivar em vez de aceitar uma URL própria significa que nenhum descuido de
// configuração consegue apontar o teste — que APAGA dados — para a produção.
//
// Uso:  node scripts/banco-de-teste.mjs            (prepara)
//       node scripts/banco-de-teste.mjs --recriar  (APAGA e recria do zero)
//       node scripts/banco-de-teste.mjs --url      (só imprime a URL derivada)
//
// --recriar existe por um defeito medido: `prisma migrate deploy` NÃO reaplica
// migration já marcada como aplicada. Se alguém alterar o schema do banco de
// teste à mão (foi o que aconteceu ao provar a trava de overbooking, derrubando
// a constraint), rodar "prepara" de novo NÃO conserta — o banco fica divergindo
// do schema em silêncio, e o verde deixa de valer.

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUFIXO = '_teste';

function urlDoAmbiente() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // Fora do CI a URL mora no .env, que o dotenv só carrega dentro da app.
  const env = join(RAIZ, '.env');
  if (!existsSync(env)) return null;
  const m = readFileSync(env, 'utf8').match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  return m ? m[1] : null;
}

export function urlDeTeste() {
  const original = urlDoAmbiente();
  if (!original) {
    throw new Error(
      'DATABASE_URL não encontrada (nem no ambiente, nem no .env). Os testes de ' +
        'integração precisam de um Postgres.',
    );
  }
  const u = new URL(original);
  const nome = u.pathname.replace(/^\//, '');
  if (!nome) throw new Error(`DATABASE_URL sem nome de banco: ${original}`);
  if (nome.endsWith(SUFIXO)) return original; // já é o de teste

  u.pathname = `/${nome}${SUFIXO}`;
  return u.toString();
}

/**
 * URL do banco `postgres`, usada só para poder criar o banco de teste.
 *
 * A query string é REMOVIDA: o Prisma usa `?schema=public`, e o psql recusa com
 * "parâmetro da consulta de URI inválido: schema". É uma pegadinha conhecida
 * deste projeto e custa uns minutos toda vez que reaparece.
 */
function urlDeAdministracao(alvo) {
  const u = new URL(alvo);
  u.pathname = '/postgres';
  u.search = '';
  return u.toString();
}

function nomeDoBanco(alvo) {
  return new URL(alvo).pathname.replace(/^\//, '').split('?')[0];
}

function rodar(comando, args, env) {
  const r = spawnSync(comando, args, {
    cwd: RAIZ,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { ok: r.status === 0, saida: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function principal() {
  const alvo = urlDeTeste();
  const nome = nomeDoBanco(alvo);

  if (process.argv.includes('--url')) {
    process.stdout.write(alvo);
    return;
  }

  // Cinto de segurança: nome sem o sufixo é recusado. Se um dia alguém mexer na
  // derivação acima, esta linha impede que a criação/migração caia noutro banco.
  if (!nome.endsWith(SUFIXO)) {
    console.error(`Recusando: o banco de teste precisa terminar em "${SUFIXO}" (veio "${nome}").`);
    process.exit(1);
  }

  console.log(`→ Banco de teste: ${nome}`);

  if (process.argv.includes('--recriar')) {
    const derrubada = rodar('psql', [
      urlDeAdministracao(alvo), '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS "${nome}"`,
    ]);
    if (!derrubada.ok) {
      console.error('Falha ao apagar o banco de teste:\n' + derrubada.saida);
      process.exit(1);
    }
    console.log('  apagado');
  }
  // CREATE DATABASE não aceita "IF NOT EXISTS"; erro de "já existe" é sucesso.
  const criacao = rodar('psql', [urlDeAdministracao(alvo), '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE "${nome}"`]);
  if (!criacao.ok && !/already exists|já existe/i.test(criacao.saida)) {
    console.error('Falha ao criar o banco de teste:\n' + criacao.saida);
    process.exit(1);
  }
  console.log(criacao.ok ? '  criado' : '  já existia');

  const migracao = rodar('npx', ['prisma', 'migrate', 'deploy'], { DATABASE_URL: alvo });
  if (!migracao.ok) {
    console.error('Falha ao aplicar as migrations no banco de teste:\n' + migracao.saida);
    process.exit(1);
  }
  console.log('  migrations aplicadas');
}

// Só executa quando chamado direto; o import de urlDeTeste não deve fazer nada.
if (process.argv[1] && process.argv[1].endsWith('banco-de-teste.mjs')) principal();
