import { randomBytes } from 'crypto';

// Alfabeto sem caracteres ambíguos (0/O, 1/I/L) — o dono lê e digita o código à
// mão às vezes. 6 posições nesse alfabeto ~= 1 bi de combinações, folgado.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

/**
 * Gera um código de indicação aleatório e legível (ex.: "K7QMP4"). Unicidade é
 * garantida pelo @unique de Business.referralCode + retry em quem chama.
 */
export function newReferralCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let code = '';
  for (let i = 0; i < CODE_LEN; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/** Normaliza um código vindo da URL/entrada: maiúsculas, sem espaços. */
export function normalizeReferralCode(raw?: string | null): string | null {
  const v = (raw ?? '').trim().toUpperCase();
  return v && /^[A-Z0-9]{4,12}$/.test(v) ? v : null;
}
