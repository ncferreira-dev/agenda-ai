import type { ValidationError } from 'class-validator';

// ---------------------------------------------------------------------------
// Traduz o resultado do ValidationPipe numa mensagem única, em português.
//
// Existe por dois defeitos que aparecem no instante em que se liga o pipe:
//
//   1. O Nest devolve `message` como ARRAY. O front faz
//      `setErro(body?.message ?? '...')` e joga isso num elemento de texto —
//      um array vira "erro um,erro dois" grudado na tela. Todo consumidor
//      esperava string, porque até aqui as mensagens vinham de
//      `new BadRequestException('...')`.
//   2. As mensagens que o class-validator gera sozinho são em inglês
//      ("password must be a string"), e este produto é todo em português, do
//      banco à tela. Mensagem de erro é parte do produto.
// ---------------------------------------------------------------------------

// A regra `whitelistValidation` é a que dispara com forbidNonWhitelisted. A
// mensagem dela ("property X should not exist") descreve um defeito de QUEM
// CHAMA, não algo que o usuário digitou errado — não adianta mostrar pra ele.
const CHAVE_DE_CAMPO_EXTRA = 'whitelistValidation';
const CAMPO_EXTRA = 'Pedido com campo não reconhecido.';

/**
 * Devolve a primeira mensagem útil, percorrendo também os erros aninhados (um
 * DTO com objeto dentro reporta o filho em `children`, e não em `constraints`).
 * Sem mensagem legível, devolve null pra quem chama decidir o padrão.
 */
export function primeiraMensagemDeErro(erros: ValidationError[]): string | null {
  for (const erro of erros ?? []) {
    const constraints = erro.constraints ?? {};
    if (CHAVE_DE_CAMPO_EXTRA in constraints) return CAMPO_EXTRA;

    for (const mensagem of Object.values(constraints)) {
      // Só aproveita o que foi escrito à mão. O texto automático do
      // class-validator é em inglês; deixá-lo passar seria trocar um idioma
      // pelo outro no meio da tela.
      if (mensagem && ehPortugues(mensagem)) return mensagem;
    }

    const doFilho = primeiraMensagemDeErro(erro.children ?? []);
    if (doFilho) return doFilho;
  }
  return null;
}

// Heurística deliberadamente burra: as mensagens automáticas do class-validator
// são todas do formato "<campo> must be ..." / "<campo> should not ...". Se um
// dia mudarem, o pior que acontece é cair na mensagem genérica — nunca vazar
// inglês pra tela, que é o que importa.
function ehPortugues(mensagem: string): boolean {
  return !/\b(must|should|has to)\b/i.test(mensagem);
}
