import type Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Recorte do histórico da conversa.
//
// Cortar por posição (slice(-N)) parece inofensivo e não é: a API rejeita o
// histórico se ele começar no lugar errado, e aí a conversa daquele cliente
// para de funcionar pra sempre — toda mensagem seguinte dá 400, o controller
// engole no catch e o cliente simplesmente nunca mais recebe resposta.
//
// Duas fronteiras inválidas:
//   1. começar numa mensagem `assistant` -> "first message must use the user role";
//   2. começar num `user` que só carrega tool_result -> o tool_use correspondente
//      ficou pra trás no corte, e a API recusa o tool_result órfão.
//
// Então recorta na fronteira segura mais próxima: a primeira mensagem do
// usuário que NÃO seja devolução de ferramenta — ou seja, uma fala de verdade
// do cliente, que é sempre um começo de conversa válido.
// ---------------------------------------------------------------------------

/** Uma mensagem serve de início de histórico? */
function ehFronteiraSegura(m: Anthropic.MessageParam): boolean {
  if (m.role !== 'user') return false;
  // Texto puro (o caso comum: o cliente escreveu algo).
  if (typeof m.content === 'string') return true;
  // Bloco de tool_result é continuação de um ciclo, não um começo.
  return !m.content.some((bloco) => bloco.type === 'tool_result');
}

export function recortarHistorico(
  messages: Anthropic.MessageParam[],
  max: number,
): Anthropic.MessageParam[] {
  if (messages.length <= max) return messages;

  let inicio = messages.length - max;
  while (inicio < messages.length && !ehFronteiraSegura(messages[inicio])) {
    inicio++;
  }

  // Nenhuma fronteira segura da posição do corte em diante (conversa inteira
  // dentro de um ciclo de ferramentas). Guarda tudo: histórico grande demais é
  // problema de custo, histórico inválido é o cliente sem atendimento.
  if (inicio >= messages.length) return messages;

  return messages.slice(inicio);
}
