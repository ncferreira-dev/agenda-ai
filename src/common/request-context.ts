import { AsyncLocalStorage } from 'node:async_hooks';

// ---------------------------------------------------------------------------
// Quem está escrevendo, disponível em qualquer profundidade sem passar por
// parâmetro. É o que permite a trilha de auditoria gravar o autor sem que cada
// service precise receber e repassar um `autor` — trilha que depende de alguém
// lembrar de repassar é trilha com buraco.
//
// ARMADILHA (custou caro no projeto de origem): o PrismaPromise é PREGUIÇOSO.
// Montar a query dentro do callback e dar o await FORA dele executa a escrita
// depois que o contexto já saiu de cena, e o autor grava null em silêncio — sem
// erro, sem aviso, só uma linha de auditoria anônima. O await precisa estar
// DENTRO do runWith.
// ---------------------------------------------------------------------------

export type TipoDeAtor = 'OWNER' | 'CLIENTE' | 'SISTEMA';

export interface ContextoDaRequisicao {
  /** Só existe quando o ator é OWNER (requisição do painel, com JWT). */
  ownerId?: string;
  /** Tenant da requisição, quando conhecido. */
  businessId?: string;
  ator: TipoDeAtor;
}

const storage = new AsyncLocalStorage<ContextoDaRequisicao>();

export function runWith<T>(contexto: ContextoDaRequisicao, fn: () => T): T {
  return storage.run(contexto, fn);
}

/**
 * Contexto atual. Fora de uma requisição (cron, webhook, seed) não há store, e
 * o padrão é SISTEMA — que é a verdade: quem escreveu foi o processo, não uma
 * pessoa. Devolver OWNER por omissão seria inventar um responsável.
 */
export function contextoAtual(): ContextoDaRequisicao {
  return storage.getStore() ?? { ator: 'SISTEMA' };
}
