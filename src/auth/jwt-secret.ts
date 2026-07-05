// Segredo de assinatura do JWT do painel. É OBRIGATÓRIO: sem ele qualquer um
// forjaria um token e assumiria qualquer tenant (fura a Regra de Ouro nº 1 —
// isolamento multi-tenant). Por isso NÃO há fallback: se a env não estiver
// definida, a app FALHA no boot com erro claro em vez de subir insegura.
export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error(
      'JWT_SECRET não configurado — defina um segredo forte antes de subir a API. ' +
        'Sem ele o isolamento multi-tenant fica exposto.',
    );
  }
  return secret;
}
