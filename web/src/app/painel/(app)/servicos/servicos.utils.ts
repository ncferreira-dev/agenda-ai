import type { Service } from '@/lib/panel-api';

// ---------------------------------------------------------------------------
// Regras puras da tela de serviços. Estavam dentro do ServicesManager, que tem
// 366 linhas — só dava pra exercitá-las renderizando a tela inteira.
// ---------------------------------------------------------------------------

/**
 * Valor em reais SEM o "R$" (quem põe o prefixo é o JSX). Diferente do `brl` do
 * lib/format de propósito: aqui o número aparece dentro de frases como
 * "-R$ 5,00" e "R$ 40,00 · 30 min", onde o prefixo já está escrito ao lado.
 */
export function reais(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

/**
 * Quem pode entrar num kit: serviço COMUM e ATIVO.
 *
 * - Kit não aninha kit. Permitir viraria duração recursiva, e a soma nunca
 *   fecharia.
 * - Serviço inativo não entra: ele não pode ser agendado sozinho, e entrar num
 *   kit o faria voltar pela porta dos fundos.
 * - `excetoId` tira o próprio serviço da lista na EDIÇÃO de um kit: sem isso, um
 *   kit poderia se incluir.
 */
export function candidatosDeKit(services: Service[], excetoId?: string): Service[] {
  return services.filter((s) => !s.isKit && s.active && s.id !== excetoId);
}

/** Rótulo do desconto mostrado ao lado do nome: "-10%" ou "-R$ 5,00". */
export function rotuloDeDesconto(service: Pick<Service, 'discountKind' | 'discountValue'>): string | null {
  if (!service.discountKind) return null;
  return service.discountKind === 'PERCENT'
    ? `-${service.discountValue}%`
    : `-R$ ${reais(service.discountValue)}`;
}
