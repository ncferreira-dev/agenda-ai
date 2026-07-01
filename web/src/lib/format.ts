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
