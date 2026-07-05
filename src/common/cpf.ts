import { createHmac } from 'crypto';

// CPF do dono (LGPD): o número cru NUNCA é gravado. Guardamos só um blind index
// — HMAC-SHA256 determinístico com CPF_HASH_SECRET — que permite checar
// unicidade sem expor o número. Mesmo segredo => mesmo hash (não trocar o
// CPF_HASH_SECRET, senão os hashes já gravados deixam de bater).

/** Tira tudo que não é dígito. Não valida (use isValidCpf pra isso). */
export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Blind index do CPF: HMAC-SHA256(dígitos, CPF_HASH_SECRET) em hex.
 * Normaliza por dentro pra ser idempotente — receba cru ou já normalizado.
 */
export function hashCpf(value: string): string {
  const secret = process.env.CPF_HASH_SECRET;
  if (!secret) {
    throw new Error(
      'CPF_HASH_SECRET não configurado — defina um segredo forte e DEFINITIVO ' +
        'antes do primeiro cadastro (mudá-lo depois invalida todos os CPFs já gravados).',
    );
  }
  return createHmac('sha256', secret).update(normalizeCpf(value)).digest('hex');
}

/**
 * Valida CPF pelos dois dígitos verificadores (mesmo algoritmo do cadastro de
 * profissional). Rejeita tamanho != 11 e sequências repetidas (000…, 111…).
 */
export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digit = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}
