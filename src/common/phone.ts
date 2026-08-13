// ---------------------------------------------------------------------------
// Normalização de telefone para E.164 sem o "+", que é o formato gravado no
// banco (Business.phone, Customer.phone, Professional.phone).
//
// Por que isto existe: o número entra no sistema por caminhos diferentes e cada
// um o entrega num formato — o dono digita no painel com máscara, o cliente
// digita no site como quiser, e a Meta manda `display_phone_number` em formato
// de exibição (pode vir com "+", espaço e hífen) e `wa_id` em dígitos. Se cada
// lado guardar do seu jeito, o roteamento do webhook procura um número que não
// existe, a mensagem é descartada e o único rastro é um warn no log.
//
// Diferente dos normalizadores do painel, este NÃO lança: no caminho do webhook
// um número estranho deve virar "não achei o negócio" e ser logado, nunca
// derrubar o processamento do lote inteiro.
// ---------------------------------------------------------------------------

/** Menor e maior tamanho plausível em dígitos, já com DDI. */
const MIN = 10;
const MAX = 13;

export function normalizarTelefone(bruto: string | null | undefined): string | null {
  const digitos = (bruto ?? '').replace(/\D/g, '');
  if (!digitos) return null;
  if (digitos.length < MIN || digitos.length > MAX) return null;
  // Mesma regra dos outros normalizadores do projeto: assume Brasil quando o
  // número chega sem DDI.
  return digitos.startsWith('55') ? digitos : `55${digitos}`;
}
