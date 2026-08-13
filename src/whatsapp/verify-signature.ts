import { createHmac, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Verificação da assinatura do webhook da Meta.
//
// A Meta assina TODO payload com HMAC-SHA256 usando o App Secret e manda o
// resultado no header `X-Hub-Signature-256: sha256=<hex>`. Sem conferir isso, o
// endpoint aceita qualquer POST da internet: dá pra forjar mensagem de cliente,
// fazer o agente criar/cancelar agendamento no banco, queimar token da Anthropic
// e usar o número do dono como relay de spam (ele paga a conversa).
//
// Precisa do corpo BRUTO, não do JSON já parseado: o HMAC é sobre os bytes
// exatos que a Meta enviou, e reserializar muda espaços/ordem e quebra a conta.
// O `rawBody: true` no main.ts (que o Stripe já usava) deixa isso disponível.
// ---------------------------------------------------------------------------

export type ResultadoAssinatura =
  | { ok: true }
  | { ok: false; motivo: 'sem-segredo' | 'sem-header' | 'formato' | 'nao-confere' };

export function verificarAssinatura(
  rawBody: Buffer | undefined,
  header: string | undefined,
  appSecret: string | undefined,
): ResultadoAssinatura {
  if (!appSecret) return { ok: false, motivo: 'sem-segredo' };
  if (!header) return { ok: false, motivo: 'sem-header' };
  if (!rawBody?.length) return { ok: false, motivo: 'formato' };

  // Formato esperado: "sha256=<64 chars hex>".
  const [algoritmo, assinatura] = header.split('=');
  if (algoritmo !== 'sha256' || !assinatura) return { ok: false, motivo: 'formato' };

  const esperado = createHmac('sha256', appSecret).update(rawBody).digest('hex');

  // timingSafeEqual exige buffers do mesmo tamanho — se o tamanho difere já não
  // confere, e comparar antes evita a exceção. A comparação em si é em tempo
  // constante pra não vazar o segredo byte a byte por medição de tempo.
  const a = Buffer.from(assinatura, 'hex');
  const b = Buffer.from(esperado, 'hex');
  if (a.length !== b.length) return { ok: false, motivo: 'nao-confere' };

  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, motivo: 'nao-confere' };
}
