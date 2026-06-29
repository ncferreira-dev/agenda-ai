'use client';

import { useState } from 'react';
import { maskFormat } from '@/lib/format';

// Reexporta pra não quebrar os imports existentes (componentes client).
// A função em si vive em @/lib/format pra poder rodar no servidor também.
export { maskFormat };

type Kind = 'phone' | 'cpf' | 'cep';

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
