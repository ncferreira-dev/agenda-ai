#!/usr/bin/env node
// Verificador de entrega do agend.ai. O comando que responde "posso entregar
// isto?". Adaptado do verificador do Alicerce — o maquinário no fim do arquivo
// é o mesmo, só a configuração aqui em cima é deste projeto.
//
// A regra que este arquivo existe para cumprir: correção de defeito de padrão só
// conta como feita com varredura provando que sobrou ZERO. Por isso quase toda
// checagem aqui é uma BUSCA QUE DEVE VOLTAR VAZIA, e não um teste que afirma
// sucesso. Um teste verde prova que um caminho funciona. Uma busca vazia prova
// que a classe inteira do defeito não existe em lugar nenhum.
//
// Duas regras de honestidade, e valem mais que as checagens:
//   1. Nada aqui diz "ok" sem ter olhado. Toda checagem imprime o que procurou,
//      em quantos arquivos, e o que achou.
//   2. Verificação que máquina não faz vai para CONFERENCIA_HUMANA no fim, e não
//      vira checagem falsa que passa sempre.
//
// Uso:  npm run verificar
//       node scripts/verificador.mjs --so-varredura   (pula os comandos lentos)

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SO_VARREDURA = process.argv.includes('--so-varredura');

// ===========================================================================
// CONFIGURAÇÃO 1: comandos que precisam sair com código zero
// ===========================================================================
// Nunca ponha aqui um comando com --fix: o verde precisa ser o estado do código
// commitado, não o de depois do conserto automático.

const COMANDOS = [
  { nome: 'api: typecheck e lint', cwd: '.', comando: 'npm', args: ['run', 'lint'] },
  { nome: 'api: testes', cwd: '.', comando: 'npm', args: ['test'] },
  { nome: 'web: typecheck e lint', cwd: 'web', comando: 'npm', args: ['run', 'lint'] },
];

// ===========================================================================
// CONFIGURAÇÃO 2: varreduras que devem voltar vazias
// ===========================================================================

const VARREDURAS = [
  {
    nome: 'nenhuma supressão do TypeScript',
    porque:
      '@ts-ignore desliga a checagem na linha seguinte e não deixa rastro no build. ' +
      'Foi assim que `input: any` no executor de ferramentas escondeu quatro campos ' +
      'que o modelo pode não mandar: só ao tirar o any o compilador apontou os quatro.',
    raiz: '.',
    extensoes: ['.ts', '.tsx'],
    // A diretiva precisa vir logo depois do abre-comentário: sem essa âncora a
    // busca acusa qualquer comentário que MENCIONE @ts-ignore, inclusive este.
    // E aqui não dá pra usar semComentarios: a diretiva É um comentário.
    padrao: /\/[/*]\s*@ts-(ignore|nocheck|expect-error)\b/,
    semComentarios: false,
  },
  {
    nome: 'nenhum eslint-disable além do <img> do Next',
    porque:
      'os 10 disables que existem são todos @next/next/no-img-element, escolha ' +
      'deliberada de não usar next/image. Essa é permitida e contada; qualquer ' +
      'OUTRA regra silenciada precisa aparecer aqui em vez de entrar de carona.',
    raiz: '.',
    extensoes: ['.ts', '.tsx'],
    padrao: /\/[/*]\s*eslint-disable(?![^\n]*@next\/next\/no-img-element)/,
    semComentarios: false,
  },
  {
    nome: 'nenhuma checagem que conserta o que mede',
    porque: 'lint --fix faz o verde ser o estado DEPOIS do conserto, e não o do código entregue.',
    raiz: '.',
    extensoes: ['package.json'],
    padrao: /"(lint|check|verificar|verify|test)"\s*:\s*"[^"]*--fix/,
    semComentarios: false,
  },
  {
    nome: 'nenhum console.log fora das suítes de teste',
    porque:
      'log solto vaza dado de cliente pro stdout do container, e no Render o stdout ' +
      'do build imprime env. As suítes são isentas porque o console.log delas É a ' +
      'saída do teste — é assim que o runner reporta.',
    raiz: 'src',
    extensoes: ['.ts'],
    padrao: /console\.log\(/,
    permitido: ['.spec.ts'],
    semComentarios: true,
  },
  {
    nome: 'nenhum catch que engole o erro em silêncio',
    porque: 'erro engolido vira comportamento errado sem sintoma, que é a classe mais cara de achar.',
    raiz: '.',
    extensoes: ['.ts', '.tsx'],
    padrao: /catch\s*(\([^)]*\))?\s*\{\s*\}/,
    semComentarios: true,
  },
];

// ===========================================================================
// CONFIGURAÇÃO 2b: checagens que não são varredura de texto
// ===========================================================================

const CHECAGENS = [
  {
    // ESTA É A TRAVA DO DEFEITO DE 31/08/2026. Naquele dia, das rotas alcançáveis
    // sem login, só /auth/forgot-password tinha teto. Dava pra varrer telefones
    // em /b/:slug/appointments, encher a agenda por /bookings e rodar dicionário
    // contra /auth/login a noite inteira. O conserto foi pôr o ThrottlerGuard no
    // nível do controller; esta trava é o que impede o próximo controller anônimo
    // de nascer sem ele.
    nome: 'toda rota anônima tem rate limit',
    executar() {
      // Isentos, com o motivo ao lado. Isenção sem motivo escrito vira porta.
      const ISENTOS = {
        'health.controller.ts':
          'só devolve {ok,ts}; é o que o monitor consulta, e limitar o monitor é o contrário do que se quer',
        'stripe-webhook.controller.ts':
          'quem chama é a Stripe, autenticada por assinatura (constructEvent); limitar por IP derrubaria retentativa legítima',
        'whatsapp.controller.ts':
          'quem chama é a Meta, autenticada por assinatura (verificarAssinatura); mesmo motivo',
      };

      const controllers = listarArquivos(join(RAIZ, 'src'), ['.controller.ts']);
      const detalhes = [];
      let anonimos = 0;

      for (const caminho of controllers) {
        const nome = caminho.split('/').pop();
        const fonte = ler(caminho);
        if (fonte === null || fonte === '') continue;
        // Controller que exige JWT não é superfície anônima.
        if (fonte.includes('JwtAuthGuard')) continue;
        anonimos += 1;
        if (ISENTOS[nome]) continue;
        if (!fonte.includes('ThrottlerGuard')) {
          detalhes.push(`${relative(RAIZ, caminho)}: anônimo e sem ThrottlerGuard`);
        }
      }

      return {
        ok: detalhes.length === 0,
        procurou: `${controllers.length} controller(s), ${anonimos} sem JwtAuthGuard, ${Object.keys(ISENTOS).length} isento(s) com motivo`,
        achou: detalhes.length === 0 ? 'todos os anônimos com ThrottlerGuard' : `${detalhes.length} desprotegido(s)`,
        detalhes,
      };
    },
  },
  {
    // TRAVA DO DEFEITO DE 31/08/2026 (o segundo do dia). A API não tinha um
    // único arquivo .dto.ts: todo corpo de requisição era um tipo inline
    // (`@Body() body: { nome?: string }`), e tipo inline o TypeScript apaga na
    // compilação. O ValidationPipe do Nest só age em parâmetro cujo tipo existe
    // em tempo de execução, ou seja: nada era conferido. A conferência real era
    // um punhado de `if (!body?.x)` no começo de cada handler, fácil de esquecer
    // numa rota nova — e foi esquecida em várias.
    //
    // Esta trava não sabe se o DTO valida BEM. Ela garante o degrau anterior,
    // que é o que faltava: que exista um lugar onde a regra CAIBA.
    nome: 'todo @Body() usa um DTO (classe), e não tipo inline',
    executar() {
      // Isentos, com motivo. Isenção sem motivo escrito vira porta.
      const ISENTOS = {
        'whatsapp.controller.ts':
          'o corpo é o webhook da Meta, autenticado por assinatura e lido pelo parseWebhook, que já trata cada nível como ausente',
      };

      const controllers = listarArquivos(join(RAIZ, 'src'), ['.controller.ts']);
      const detalhes = [];
      let total = 0;

      for (const caminho of controllers) {
        const nomeArquivo = caminho.split('/').pop();
        const fonte = ler(caminho);
        if (!fonte) continue;
        const isento = Boolean(ISENTOS[nomeArquivo]);

        fonte.split('\n').forEach((linha, i) => {
          if (!linha.includes('@Body')) return;
          total += 1;
          const rel = `${relative(RAIZ, caminho)}:${i + 1}`;

          // `@Body('campo')` extrai a propriedade solta. O pipe não valida
          // primitivo, então {planId:{"$ne":null}} chegava como objeto num
          // lugar tipado como string. Não tem isenção: use um DTO.
          if (/@Body\(\s*['"`]/.test(linha)) {
            detalhes.push(`${rel}: @Body('campo') não passa pelo ValidationPipe`);
            return;
          }
          if (isento) return;

          // `@Body() nome: Tipo` — o Tipo precisa ser uma classe *Dto.
          const m = /@Body\(\)\s*\w+\s*:\s*([A-Za-z0-9_]+)/.exec(linha);
          if (!m) {
            detalhes.push(`${rel}: não consegui ler o tipo do @Body()`);
          } else if (!m[1].endsWith('Dto')) {
            detalhes.push(`${rel}: @Body() tipado como ${m[1]}, que não é um DTO`);
          }
        });
      }

      return {
        ok: detalhes.length === 0,
        procurou: `${total} uso(s) de @Body em ${controllers.length} controller(s), ${Object.keys(ISENTOS).length} isento com motivo`,
        achou: detalhes.length === 0 ? 'todos com DTO' : `${detalhes.length} sem DTO`,
        detalhes,
      };
    },
  },
  {
    // O repositório é PÚBLICO (está escrito no .gitignore, junto da regra de
    // nunca versionar dump do banco). Segredo aqui não é vazamento interno: é
    // publicação. Varre TODO arquivo de texto, sem lista de extensão, porque o
    // arquivo que vaza segredo é justamente o que ninguém pensou em listar.
    nome: 'nenhum segredo de verdade versionado no repositório',
    executar() {
      const FORMATOS = [
        { nome: 'Stripe', padrao: /\bsk_(live|test)_[A-Za-z0-9]{20,}/ },
        { nome: 'OpenAI/Anthropic', padrao: /\bsk-(ant-)?[A-Za-z0-9_-]{28,}/ },
        { nome: 'AWS', padrao: /\bAKIA[0-9A-Z]{16}\b/ },
        { nome: 'GitHub', padrao: /\b(ghp|gho|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/ },
        { nome: 'Google', padrao: /\bAIza[0-9A-Za-z_-]{30,}/ },
        { nome: 'Meta/WhatsApp', padrao: /\bEAA[A-Za-z0-9]{60,}/ },
        { nome: 'chave privada', padrao: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
        { nome: 'senha em string de conexão', padrao: /postgres(ql)?:\/\/[^\s:@/]+:[^\s:@/]{8,}@(?!localhost|127\.0\.0\.1|ninguem)/ },
      ];

      const arquivos = listarArquivos(RAIZ, ['']);
      const detalhes = [];
      let lidos = 0;

      for (const caminho of arquivos) {
        const relativo = relative(RAIZ, caminho);
        // O próprio verificador tem os padrões escritos dentro dele.
        if (relativo === join('scripts', 'verificador.mjs')) continue;
        if (relativo.endsWith('package-lock.json')) continue;
        // .env está no .gitignore: não vai pro repositório, e é onde os segredos
        // REAIS moram em desenvolvimento. Varrê-lo faria a checagem nascer
        // vermelha para sempre acusando o arquivo que está certo.
        if (relativo === '.env' || relativo.startsWith('.env.')) continue;

        const conteudo = ler(caminho);
        if (conteudo === null || conteudo === '' || conteudo.includes('\0')) continue;
        lidos += 1;

        for (const formato of FORMATOS) {
          if (formato.padrao.test(conteudo)) {
            // O trecho que casou NUNCA é impresso: verificador que mostra o
            // segredo pra provar que achou o segredo publica o segredo no log.
            detalhes.push(`${relativo}: parece conter chave de ${formato.nome}`);
          }
        }
      }

      return {
        ok: detalhes.length === 0,
        procurou: `${FORMATOS.length} formatos de chave em ${lidos} arquivo(s) de texto, sem filtrar extensão`,
        achou: detalhes.length === 0 ? 'nada' : `${detalhes.length} arquivo(s) suspeito(s)`,
        detalhes,
      };
    },
  },
];

// ===========================================================================
// CONFIGURAÇÃO 3: o que máquina não verifica
// ===========================================================================
// Impresso no fim, marcado como humano. Existe pra que a AUSÊNCIA de verificação
// seja visível. Trava que não existe e é declarada é honesta; trava que existe e
// não olha nada é o pior estado possível.

const CONFERENCIA_HUMANA = [
  'web/ NÃO TEM TESTE AUTOMATIZADO NENHUM. O verificador roda typecheck e lint ' +
    'lá, e só. Toda regra de tela — fuso do negócio no rótulo do horário, kit que ' +
    'recalcula duração, token que some do localStorage em aba anônima — está ' +
    'coberta por conferência humana e nada mais.',
  'Abrir /[slug] em 390px com o dado mais longo que o sistema aceita: serviço de ' +
    '45 letras, nome de profissional de 40. No console: ' +
    '[...document.querySelectorAll("*")].filter(e => e.getBoundingClientRect().right > innerWidth + 1) ' +
    'precisa voltar vazio.',
  'Agendar de verdade pelo site e conferir que "Meus agendamentos" abre sozinho ' +
    'depois, no mesmo navegador, SEM pedir telefone. Depois abrir numa aba ' +
    'anônima e conferir que aparece o texto explicando, e não uma tela quebrada.',
  'Rodar `npx prisma migrate deploy` contra a produção é irreversível e nenhum ' +
    'teste cobre isso. Confira a DATABASE_URL antes, à mão, toda vez.',
];

// ===========================================================================
// Daqui para baixo é maquinário. Normalmente não precisa mexer.
// ===========================================================================

const VERDE = '\x1b[32m';
const VERMELHO = '\x1b[31m';
const AMARELO = '\x1b[33m';
const CINZA = '\x1b[90m';
const NEGRITO = '\x1b[1m';
const FIM = '\x1b[0m';

const IGNORAR = [
  'node_modules', '.next', 'dist', 'build', '.git', 'coverage',
  '.venv', '__pycache__', 'vendor', '.turbo',
];

const resultados = [];

function registrar(nome, ok, procurou, achou, detalhes = []) {
  resultados.push({ nome, ok });
  const selo = ok ? `${VERDE}[ ok  ]${FIM}` : `${VERMELHO}[FALHA]${FIM}`;
  console.log(`${selo} ${nome}`);
  console.log(`${CINZA}        procurou: ${procurou}${FIM}`);
  console.log(`${CINZA}        achou:    ${achou}${FIM}`);
  for (const linha of detalhes.slice(0, 8)) {
    console.log(`${CINZA}          ${linha}${FIM}`);
  }
  if (detalhes.length > 8) {
    console.log(`${CINZA}          ... mais ${detalhes.length - 8}${FIM}`);
  }
}

function listarArquivos(dir, extensoes) {
  const achados = [];
  if (!existsSync(dir)) return achados;
  let entradas;
  try {
    entradas = readdirSync(dir);
  } catch {
    return achados;
  }
  for (const nome of entradas) {
    if (IGNORAR.includes(nome)) continue;
    const caminho = join(dir, nome);
    let info;
    try {
      info = statSync(caminho);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      achados.push(...listarArquivos(caminho, extensoes));
    } else if (extensoes.some((ext) => nome.endsWith(ext))) {
      achados.push(caminho);
    }
  }
  return achados;
}

function ler(caminho) {
  try {
    return readFileSync(caminho, 'utf8');
  } catch {
    return '';
  }
}

// Tira comentário de linha e de bloco, preservando a contagem de linhas para
// que o número reportado continue batendo com o arquivo real.
function semComentarios(fonte) {
  let saida = fonte.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  saida = saida
    .split('\n')
    .map((linha) => {
      const pos = linha.indexOf('//');
      if (pos === -1) return linha;
      // Não corta se o // estiver dentro de string (heurística barata: número
      // ímpar de aspas antes dele). Evita mutilar URLs.
      const antes = linha.slice(0, pos);
      const aspas = (antes.match(/["'`]/g) || []).length;
      if (aspas % 2 === 1) return linha;
      return antes;
    })
    .join('\n');
  return saida;
}

function rodarVarredura(v) {
  const raiz = join(RAIZ, v.raiz);
  const arquivos = listarArquivos(raiz, v.extensoes);
  const teto = v.maximo ?? 0;
  const ocorrencias = [];

  for (const arquivo of arquivos) {
    const rel = relative(RAIZ, arquivo);
    if (v.permitido?.some((p) => rel.includes(p))) continue;
    const fonte = v.semComentarios ? semComentarios(ler(arquivo)) : ler(arquivo);
    fonte.split('\n').forEach((linha, i) => {
      if (v.padrao.test(linha)) {
        ocorrencias.push(`${rel}:${i + 1}  ${linha.trim().slice(0, 90)}`);
      }
    });
  }

  const ok = ocorrencias.length <= teto;
  registrar(
    v.nome,
    ok,
    `${v.padrao} em ${v.extensoes.join(', ')} sob ${v.raiz}/ (${arquivos.length} arquivos)`,
    ocorrencias.length === 0
      ? 'nada'
      : `${ocorrencias.length} ocorrência(s)${teto ? ` (teto ${teto})` : ''}`,
    ok ? [] : ocorrencias,
  );
}

function rodarComando(c) {
  const cwd = join(RAIZ, c.cwd ?? '.');
  if (!existsSync(cwd)) {
    registrar(c.nome, false, `${c.comando} ${c.args.join(' ')} em ${c.cwd}`, 'pasta não existe');
    return;
  }
  const r = spawnSync(c.comando, c.args, { cwd, encoding: 'utf8', shell: false });
  const ok = r.status === 0;
  const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const ultimas = saida.trim().split('\n').slice(-6);
  registrar(
    c.nome,
    ok,
    `${c.comando} ${c.args.join(' ')} em ${c.cwd}/`,
    ok ? 'saiu com código 0' : `saiu com código ${r.status}`,
    ok ? [] : ultimas,
  );
}

// ---------------------------------------------------------------------------

console.log(`\n${NEGRITO}Verificador de entrega${FIM}`);
console.log(`${CINZA}Cada linha diz o que procurou e o que achou. Busca que volta vazia é aprovação.${FIM}\n`);

if (!SO_VARREDURA) {
  console.log(`${NEGRITO}Comandos${FIM}`);
  for (const c of COMANDOS) rodarComando(c);
  console.log('');
} else {
  console.log(`${AMARELO}Modo --so-varredura: comandos pulados.${FIM}\n`);
}

console.log(`${NEGRITO}Varreduras${FIM}`);
for (const v of VARREDURAS) rodarVarredura(v);

for (const c of CHECAGENS) {
  const r = c.executar();
  registrar(c.nome, r.ok, r.procurou, r.achou, r.ok ? [] : r.detalhes);
}

console.log(`\n${NEGRITO}Conferência humana${FIM}`);
console.log(`${CINZA}Máquina não verifica isto. Não está aprovado nem reprovado: está por conferir.${FIM}`);
for (const item of CONFERENCIA_HUMANA) {
  console.log(`${AMARELO}  [ ]${FIM} ${item}`);
}

const falhas = resultados.filter((r) => !r.ok);
console.log('');
if (falhas.length === 0) {
  console.log(`${VERDE}${NEGRITO}${resultados.length}/${resultados.length} checagens passaram.${FIM}`);
  console.log(`${CINZA}Restam ${CONFERENCIA_HUMANA.length} item(ns) de conferência humana.${FIM}\n`);
  process.exit(0);
}

console.log(`${VERMELHO}${NEGRITO}${falhas.length} de ${resultados.length} checagens falharam:${FIM}`);
for (const f of falhas) console.log(`${VERMELHO}  - ${f.nome}${FIM}`);
console.log('');
process.exit(1);

// ---------------------------------------------------------------------------
// Nota sobre o campo `porque`, que é o mais fácil de deixar em branco e o que
// mais importa daqui a um ano:
//
// Uma trava sem motivo escrito é uma ordem. A próxima pessoa que ela atrapalhar
// vai removê-la, e vai estar certa em remover, porque ninguém obedece uma ordem
// sem argumento. Uma trava com o defeito real datado ao lado é um argumento, e
// argumento sobrevive à troca de time.
