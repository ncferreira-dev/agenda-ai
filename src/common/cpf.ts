import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'crypto';

// Utilitários de CPF compartilhados (antes duplicados em panel/professionals).
//
// Política LGPD: o CPF cru nunca é persistido. Para checar unicidade entre
// donos guardamos um "blind index" — um HMAC-SHA256 determinístico com um
// segredo do servidor (CPF_HASH_SECRET). Mesmo CPF => mesmo hash, então dá pra
// ter coluna @unique e consultar; sem o segredo o hash não é reversível por
// força bruta trivial (o espaço de CPFs é pequeno, ~10^11 — por isso o segredo
// é obrigatório).

/** Mantém só os dígitos do valor informado. */
export function onlyDigits(value: string): string {
  return (value ?? '').replace(/\D/g, '');
}

/** true se `cpf` (já só dígitos) passa nos dois dígitos verificadores. */
export function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calcDigit = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calcDigit(9) === Number(cpf[9]) && calcDigit(10) === Number(cpf[10]);
}

/**
 * Normaliza para 11 dígitos e valida pelos dígitos verificadores.
 * Lança BadRequestException('CPF inválido.') se não for válido.
 */
export function normalizeCpf(value: string): string {
  const cpf = onlyDigits(value);
  if (!isValidCpf(cpf)) throw new BadRequestException('CPF inválido.');
  return cpf;
}

/**
 * Blind index do CPF para checagem de unicidade (ver nota LGPD acima).
 * Recebe os 11 dígitos já normalizados. Exige CPF_HASH_SECRET configurado —
 * sem ele a unicidade não tem garantia, então falha alto.
 */
export function hashCpf(cpfDigits: string): string {
  const secret = process.env.CPF_HASH_SECRET;
  if (!secret) {
    throw new Error('CPF_HASH_SECRET não configurado — necessário para indexar CPF.');
  }
  return createHmac('sha256', secret).update(cpfDigits).digest('hex');
}
