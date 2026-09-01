// ---------------------------------------------------------------------------
// Regras puras da página de agendamento. Estavam soltas dentro do BookingFlow,
// que é um componente de 615 linhas — ou seja, só dava pra exercitá-las
// renderizando a tela inteira. Aqui dá pra chamar de um arquivo de teste.
// ---------------------------------------------------------------------------

// Reexportados de lib/fuso, que é a fonte única: os mesmos nomes são usados no
// painel, e duas listas separadas divergem no dia em que alguém corrige um
// acento em só uma delas.
export { DIAS_DA_SEMANA as WEEKDAYS, MESES as MONTHS } from '@/lib/fuso';
import { DIAS_DA_SEMANA } from '@/lib/fuso';

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Os próximos `count` dias a partir de `base`, em data civil local.
 *
 * `base` é parâmetro (e não `new Date()` lá dentro) só para o teste conseguir
 * fixar o dia: sem isso, um teste que passa hoje falha na virada do mês.
 */
export function nextDays(
  count: number,
  base: Date = new Date(),
): { iso: string; weekday: string; day: number; wd: number }[] {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    out.push({ iso, weekday: DIAS_DA_SEMANA[d.getDay()], day: d.getDate(), wd: d.getDay() });
  }
  return out;
}

/** Centavos em reais. Zero vira string vazia (serviço sem preço não mostra "R$ 0,00"). */
export function formatPrice(cents: number): string {
  if (!cents) return '';
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/**
 * Telefone digitado -> E.164 com DDI 55.
 *
 * A guarda de comprimento é o que separa o DDI 55 do DDD 55 (Rio Grande do
 * Sul): um número de Santa Maria como (55) 99999-9999 vira '55999999999' — 11
 * dígitos, começa com '55' e NÃO tem DDI. Sem o `>= 12` o DDD era comido e o
 * número ia pro banco sem DDD. Com DDI, o menor válido (55 + fixo de 10) tem
 * 12 dígitos.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
}

/** Iniciais para o avatar: primeira letra do primeiro e do segundo nome. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
}
