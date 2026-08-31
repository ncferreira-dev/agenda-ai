import { Logger } from '@nestjs/common';

const logger = new Logger('env');
const isProd = process.env.NODE_ENV === 'production';

/**
 * Lê uma env que é OBRIGATÓRIA em produção mas tem fallback aceitável em dev.
 * Em produção, se estiver ausente/vazia, FALHA no boot com erro claro — em vez
 * de cair silenciosamente em `localhost` e falhar de um jeito difícil de
 * diagnosticar (era o risco do item 7 da auditoria). Em dev, usa o fallback e
 * avisa uma vez.
 */
export function requiredInProd(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.trim()) return value;
  if (isProd) {
    throw new Error(
      `${name} não configurado — obrigatório em produção. ` +
        `Sem ele a app cairia em "${devFallback}", que não funciona fora do dev.`,
    );
  }
  logger.warn(`${name} ausente; usando fallback de dev "${devFallback}".`);
  return devFallback;
}

/**
 * Lista de origens permitidas no CORS. Aceita várias separadas por vírgula
 * (ex.: "https://app.agend.ai,https://agend.ai"). WEB_ORIGIN é obrigatória em
 * produção. Confirma o item 9: a origem tem que apontar pro domínio real.
 */
export function corsOrigins(): string[] {
  return requiredInProd('WEB_ORIGIN', 'http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Origem pública CANÔNICA do front — a primeira da lista do WEB_ORIGIN. Use
 * SEMPRE isto pra montar URL que o usuário vai abrir (link de reset de senha,
 * redirect pós-OAuth, return_url do Stripe). Ler `process.env.WEB_ORIGIN` cru
 * quebra quando há mais de uma origem: "https://app.x,https://x" viraria o host
 * "https://app.x,https://x/painel/...". requiredInProd garante que existe em prod.
 */
export function webOrigin(): string {
  return corsOrigins()[0];
}
