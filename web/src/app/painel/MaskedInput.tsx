'use client';

import { useState } from 'react';

type Kind = 'phone' | 'cpf' | 'cep';

// Formata só pra exibição. O backend tira os não-dígitos de qualquer jeito,
// então o valor mascarado pode ser submetido direto.
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

export function MaskedInput({
  kind,
  name,
  defaultValue,
  placeholder,
  className,
}: {
  kind: Kind;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  className?: string;
}) {
  const [val, setVal] = useState(() => maskFormat(kind, defaultValue ?? ''));
  return (
    <input
      className={className}
      name={name}
      value={val}
      placeholder={placeholder}
      inputMode="numeric"
      onChange={(e) => setVal(maskFormat(kind, e.target.value))}
    />
  );
}
