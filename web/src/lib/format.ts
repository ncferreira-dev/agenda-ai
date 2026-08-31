// Formatação de máscaras (telefone/CPF/CEP). Fica FORA de qualquer módulo
// 'use client' pra poder ser chamada também em Server Components (a ficha do
// cliente formata o telefone no servidor).
type Kind = 'phone' | 'cpf' | 'cep';

export function maskFormat(kind: Kind, raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (kind === 'cpf') {
    const d = digits.slice(0, 11);
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  if (kind === 'cep') {
    const d = digits.slice(0, 8);
    return d.replace(/^(\d{5})(\d)/, '$1-$2');
  }
  // phone: tira o DDI 55 quando presente, formata (XX) XXXXX-XXXX
  let d = digits;
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Valida CPF pelos dois dígitos verificadores. Espelho do back (src/common/cpf.ts)
// só pra feedback instantâneo no formulário — o servidor é a fonte da verdade.
export function isValidCpf(raw: string): boolean {
  const cpf = (raw ?? '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/**
 * Centavos -> moeda brasileira. "R$ 25,00", "R$ 1.234.567,89".
 *
 * Estava DUPLICADA em seis telas do painel, e não em seis cópias iguais: quatro
 * usavam toLocaleString e duas montavam a string à mão com toFixed. As duas
 * últimas não punham separador de milhar — um faturamento de R$ 1.234.567,89
 * aparecia como "R$ 1234567,89" nessas telas e certo nas outras. Uma cópia só,
 * aqui, com teste.
 *
 * Atenção ao comparar em teste: o espaço depois de "R$" é NON-BREAKING (U+00A0),
 * que é o que o Intl produz — comparar com um espaço comum falha.
 */
export function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Mensagem legível de um erro capturado.
 *
 * `catch (e)` entrega `unknown`, que é o certo: o que é lançado pode não ser
 * Error (uma string, um objeto do fetch). O padrão antigo — `catch (e: any)`
 * com `e?.message` — devolvia `undefined` em silêncio quando o lançado não
 * tinha `message`, e a tela mostrava um erro vazio.
 */
export function mensagemDoErro(e: unknown, padrao: string): string {
  return e instanceof Error && e.message ? e.message : padrao;
}
