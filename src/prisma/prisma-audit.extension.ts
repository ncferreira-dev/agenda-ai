import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { contextoAtual } from '../common/request-context';

// ---------------------------------------------------------------------------
// Soft delete e trilha de auditoria, aplicados por extensão do Prisma.
//
// Por que extensão e não chamada nos services: trilha que depende de alguém
// lembrar de chamar `auditar()` é trilha com buraco, e o buraco aparece
// justamente na rota nova que ninguém revisou. Aqui, escrita nova nasce
// auditada sem que quem escreveu precise saber que a trilha existe.
//
// Soft delete e auditoria são conjuntos INDEPENDENTES de propósito. Pendurar os
// dois no mesmo gatilho ("só audita quem tem deletedAt") deixaria Service,
// Appointment e Business — as três entidades que mais importam — inteiramente
// fora da trilha, porque nenhuma delas é apagada: elas são alteradas.
// ---------------------------------------------------------------------------

// Quem tem soft delete: descoberto pela presença da coluna, não por lista
// escrita. Acrescentar `deletedAt` num model passa a valer sozinho.
const MODELOS_COM_SOFT_DELETE = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'deletedAt'))
    .map((m) => m.name),
);

// O que NÃO entra na trilha, e o motivo de cada um.
//
// É DENYLIST e não allowlist, de propósito: com allowlist todo model novo nasce
// fora da auditoria e ninguém percebe. Com denylist o padrão é auditar, e deixar
// algo de fora obriga a escrever o motivo aqui.
const FORA_DA_TRILHA = new Map<string, string>([
  ['AuditLog', 'auditar o próprio log é laço infinito'],
  [
    'Conversation',
    'guarda o histórico inteiro da conversa do agente e é reescrita a cada turno; a trilha viraria uma cópia do histórico, várias vezes por mensagem',
  ],
  [
    'PushSubscription',
    'nasce e morre com o dispositivo, e carrega as chaves de criptografia do navegador (p256dh/auth) — não é dado que se queira duplicar num log',
  ],
  [
    'AuthExchange',
    'code de uso único de OAuth, criado e consumido em segundos; a trilha só teria pares nascimento/morte sem pergunta que responda',
  ],
  [
    'ProcessedWebhook',
    'linha de deduplicação, uma por mensagem recebida, e sem coluna id',
  ],
  [
    'ProcessedStripeEvent',
    'mesma coisa do ProcessedWebhook, para o Stripe',
  ],
  [
    'ProfessionalService',
    'tabela de junção sem coluna id, reescrita inteira a cada salvamento do profissional; o que interessa auditar é o Professional, e esse é auditado',
  ],
]);

// Campos que NUNCA são copiados para dentro da trilha.
//
// A trilha guarda um retrato completo da linha. Sem isto, auditar Owner
// significaria escrever o hash de senha e o hash de CPF em texto dentro de uma
// tabela que ninguém trata como sensível e que vai inteira para o backup — e o
// backup deste projeto é diário e sai da máquina.
const CAMPOS_QUE_NUNCA_ENTRAM = new Set([
  'passwordHash',
  'cpfHash',
  'tokenHash',
  'codeHash',
  'p256dh',
  'auth',
]);

const OCULTO = '[oculto]';

// Exportada para ter teste próprio: é a linha de defesa entre a trilha e o
// vazamento de credencial.
export function semSegredosParaAuditoria(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(semSegredosParaAuditoria);
  if (valor === null || typeof valor !== 'object') return valor;
  if (valor instanceof Date) return valor;

  const limpo: Record<string, unknown> = {};
  for (const [chave, conteudo] of Object.entries(valor as Record<string, unknown>)) {
    // Substitui em vez de omitir: omitir faria "não tinha senha" e "tinha senha
    // e eu escondi" virarem o mesmo retrato, e a trilha existe pra dizer o que
    // havia.
    limpo[chave] = CAMPOS_QUE_NUNCA_ENTRAM.has(chave)
      ? conteudo === null || conteudo === undefined
        ? conteudo
        : OCULTO
      : semSegredosParaAuditoria(conteudo);
  }
  return limpo;
}

/**
 * De qual negócio é esta linha. A própria linha manda, e o contexto da
 * requisição é só o segundo recurso: o agendamento público não tem JWT, então
 * ali o contexto não sabe o tenant — mas a linha sabe.
 *
 * Exportada para ter teste próprio.
 */
export function businessIdDaLinha(
  model: string,
  linha: Record<string, unknown> | null | undefined,
  doContexto: string | undefined,
): string | null {
  // O Business não tem businessId: ele É o negócio.
  if (model === 'Business') {
    const proprio = linha?.id;
    if (typeof proprio === 'string') return proprio;
  }
  const daLinha = linha?.businessId;
  if (typeof daLinha === 'string') return daLinha;
  return doContexto ?? null;
}

// Escape hatch explícito para a tela de auditoria: mesclar isto no `where` faz a
// chave 'deletedAt' existir no objeto (mesmo valendo undefined), então o filtro
// automático abaixo não é aplicado e a consulta enxerga o que foi excluído.
export const INCLUIR_EXCLUIDOS = { deletedAt: undefined } as const;

type Registro = Record<string, unknown>;

// $allOperations cobre todo model e toda operação numa função só. O Prisma não
// consegue discriminar a união de shapes de `args`/`query` por um valor de
// string conhecido apenas em runtime (`operation`), então usamos aqui um shape
// local mínimo com os poucos membros que de fato lemos e escrevemos. É a mesma
// limitação documentada nos exemplos oficiais de extensão do Prisma.
interface DelegateGenerico {
  findFirst(args: { where?: Registro }): Promise<Registro | null>;
  findUnique(args: { where: Registro }): Promise<Registro | null>;
  findFirstOrThrow(args: { where?: Registro }): Promise<Registro>;
  findMany(args: { where?: Registro }): Promise<Registro[]>;
  update(args: { where?: Registro; data: Registro }): Promise<Registro>;
  updateMany(args: { where?: Registro; data: Registro }): Promise<{ count: number }>;
}

type Continuacao = (args: unknown) => Promise<unknown>;

function delegateGenerico(db: PrismaClient, model: string): DelegateGenerico {
  const chave = model.charAt(0).toLowerCase() + model.slice(1);
  return (db as unknown as Record<string, DelegateGenerico>)[chave];
}

// Prisma.JsonValue não aceita Date/undefined aninhados; normalizamos via
// JSON.stringify/parse. A limpeza de segredo acontece ANTES da serialização,
// para nenhum caminho de escrita conseguir pular esse passo.
function paraJson(valor: unknown): Prisma.InputJsonValue | undefined {
  if (valor === undefined || valor === null) return undefined;
  return JSON.parse(JSON.stringify(semSegredosParaAuditoria(valor))) as Prisma.InputJsonValue;
}

function comoRegistro(valor: unknown): Registro {
  return valor as Registro;
}

function comFiltroSoftDelete(where: Registro | undefined): Registro {
  if (where && 'deletedAt' in where) return where;
  return { ...(where ?? {}), deletedAt: null };
}

export function criarExtensaoAuditoria(db: PrismaClient) {
  return Prisma.defineExtension({
    name: 'auditoria-e-soft-delete',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || FORA_DA_TRILHA.has(model)) return query(args);

          const temSoftDelete = MODELOS_COM_SOFT_DELETE.has(model);
          const delegate = delegateGenerico(db, model);
          const proximo = query as unknown as Continuacao;
          const argsObj = comoRegistro(args);
          const where = argsObj.where as Registro | undefined;
          const { ownerId, businessId: bizDoContexto, ator } = contextoAtual();

          const registrar = async (
            action: 'CREATE' | 'UPDATE' | 'DELETE',
            linha: Registro | null | undefined,
            before?: unknown,
            after?: unknown,
          ) => {
            const entityId = linha?.id;
            // Sem id não há como identificar a linha na trilha. Todo model sem
            // id está na denylist com o motivo escrito; se um novo aparecer,
            // é melhor não gravar do que gravar uma linha que não aponta pra
            // lugar nenhum — e a trava do verificador acusa a ausência.
            if (typeof entityId !== 'string') return;
            await db.auditLog.create({
              data: {
                businessId: businessIdDaLinha(model, linha, bizDoContexto),
                entity: model,
                entityId,
                action,
                actor: ator,
                // ownerId só faz sentido quando quem agiu foi o dono.
                ownerId: ator === 'OWNER' ? (ownerId ?? null) : null,
                before: paraJson(before),
                after: paraJson(after),
              },
            });
          };

          switch (operation) {
            case 'create': {
              const dados = { ...(argsObj.data as Registro) };
              const resultado = (await proximo({ ...argsObj, data: dados })) as Registro;
              await registrar('CREATE', resultado, undefined, resultado);
              return resultado;
            }

            case 'createMany': {
              const lista = (argsObj.data as Registro[]).map((item) => ({
                ...item,
                // createMany não devolve as linhas criadas, então o id precisa
                // ser decidido AQUI pra trilha conseguir apontar pra elas.
                id: (item.id as string | undefined) ?? randomUUID(),
              }));
              const resultado = await proximo({ ...argsObj, data: lista });
              await db.auditLog.createMany({
                data: lista
                  .filter((item) => typeof item.id === 'string')
                  .map((item) => ({
                    businessId: businessIdDaLinha(model, item, bizDoContexto),
                    entity: model,
                    entityId: item.id as string,
                    action: 'CREATE' as const,
                    actor: ator,
                    ownerId: ator === 'OWNER' ? (ownerId ?? null) : null,
                    after: paraJson(item),
                  })),
              });
              return resultado;
            }

            case 'update': {
              const before = await delegate.findFirst({ where });
              const depois = (await proximo(args)) as Registro;
              await registrar('UPDATE', depois, before, depois);
              return depois;
            }

            case 'updateMany': {
              const antesLista = await delegate.findMany({ where });
              const resultado = await proximo(args);
              if (antesLista.length) {
                const ids = antesLista
                  .map((r) => r.id)
                  .filter((id): id is string => typeof id === 'string');
                const depoisLista = ids.length
                  ? await delegate.findMany({ where: { id: { in: ids } } })
                  : [];
                const depoisPorId = new Map(depoisLista.map((r) => [r.id as string, r]));
                await db.auditLog.createMany({
                  data: antesLista
                    .filter((antes) => typeof antes.id === 'string')
                    .map((antes) => ({
                      businessId: businessIdDaLinha(model, antes, bizDoContexto),
                      entity: model,
                      entityId: antes.id as string,
                      action: 'UPDATE' as const,
                      actor: ator,
                      ownerId: ator === 'OWNER' ? (ownerId ?? null) : null,
                      before: paraJson(antes),
                      after: paraJson(depoisPorId.get(antes.id as string)),
                    })),
                });
              }
              return resultado;
            }

            case 'upsert': {
              // upsert é a escrita mais fácil de esquecer numa extensão, porque
              // não se parece com create nem com update — e foi o que aconteceu
              // na primeira versão desta: o `customer.upsert` do agendamento
              // público criava cliente SEM deixar rastro nenhum. Quem decide se
              // a linha é CREATE ou UPDATE é a existência dela ANTES.
              //
              // findUnique, e NÃO findFirst: a where do upsert é uma chave
              // única, que pode ser composta (`{ businessId_phone: {...} }`).
              // findFirst não aceita esse formato e devolve
              // PrismaClientValidationError — foi exatamente o 500 que a
              // primeira tentativa deste case produziu no agendamento público.
              const antes = where ? await delegate.findUnique({ where }) : null;
              const depois = (await proximo(args)) as Registro;
              await registrar(
                antes ? 'UPDATE' : 'CREATE',
                depois,
                antes ?? undefined,
                depois,
              );
              return depois;
            }

            case 'delete': {
              const antes = await delegate.findFirst({ where });
              if (!antes) {
                // Deixa o Prisma seguir e estourar o P2025 padrão de
                // "registro não encontrado".
                return query(args);
              }
              if (!temSoftDelete) {
                // Sem deletedAt a exclusão é definitiva — e é justamente por ser
                // irreversível que o retrato de antes importa MAIS aqui.
                const resultado = await proximo(args);
                await registrar('DELETE', antes, antes);
                return resultado;
              }
              const excluido = await delegate.update({
                where,
                data: { deletedAt: new Date() },
              });
              await registrar('DELETE', antes, antes);
              return excluido;
            }

            case 'deleteMany': {
              const antesLista = await delegate.findMany({ where });
              if (!antesLista.length) return query(args);

              const resultado = temSoftDelete
                ? await delegate.updateMany({ where, data: { deletedAt: new Date() } })
                : await proximo(args);

              await db.auditLog.createMany({
                data: antesLista
                  .filter((antes) => typeof antes.id === 'string')
                  .map((antes) => ({
                    businessId: businessIdDaLinha(model, antes, bizDoContexto),
                    entity: model,
                    entityId: antes.id as string,
                    action: 'DELETE' as const,
                    actor: ator,
                    ownerId: ator === 'OWNER' ? (ownerId ?? null) : null,
                    before: paraJson(antes),
                  })),
              });
              return resultado;
            }

            // Leitura só é tocada em quem tem soft delete. Injetar
            // `deletedAt: null` num model sem a coluna estoura na hora.
            case 'findUnique':
              if (!temSoftDelete) return query(args);
              // findUnique é resolvido por índice único e não aceita filtro
              // extra no where, então vira findFirst pra caber o deletedAt.
              return delegate.findFirst({ ...argsObj, where: comFiltroSoftDelete(where) });

            case 'findUniqueOrThrow':
              if (!temSoftDelete) return query(args);
              return delegate.findFirstOrThrow({ ...argsObj, where: comFiltroSoftDelete(where) });

            case 'findFirst':
            case 'findFirstOrThrow':
            case 'findMany':
            case 'count':
            case 'aggregate':
            case 'groupBy':
              if (!temSoftDelete) return query(args);
              return proximo({ ...argsObj, where: comFiltroSoftDelete(where) });

            default:
              // Leitura desconhecida passa direto. Escrita desconhecida NÃO
              // pode passar em silêncio: foi assim que o upsert ficou fora da
              // trilha. O verificador tem uma trava que compara as operações de
              // escrita usadas no código com as tratadas aqui, mas esta linha é
              // a defesa em runtime caso alguém use uma que a varredura não viu.
              if (/^(create|update|delete|upsert)/.test(operation)) {
                throw new Error(
                  `Operação de escrita não tratada pela trilha de auditoria: ${operation} em ${model}. ` +
                    'Acrescente um case em prisma-audit.extension.ts — passar direto grava sem rastro.',
                );
              }
              return query(args);
          }
        },
      },
    },
  });
}
