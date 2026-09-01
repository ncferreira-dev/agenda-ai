import { describe, it, expect } from 'vitest';
import type { Service } from '@/lib/panel-api';
import { reais, candidatosDeKit, rotuloDeDesconto } from './servicos.utils';

const servico = (over: Partial<Service> = {}): Service => ({
  id: 's1',
  name: 'Corte',
  durationMinutes: 30,
  priceCents: 4000,
  active: true,
  followUpDays: null,
  followUpMessage: null,
  discountKind: null,
  discountValue: 0,
  isKit: false,
  kitItems: [],
  ...over,
});

describe('reais', () => {
  it('sempre com duas casas, sem o "R$"', () => {
    // O prefixo é escrito no JSX ao lado; devolver "R$ 40,00" aqui produziria
    // "R$ R$ 40,00" na tela.
    expect(reais(4000)).toBe('40,00');
    expect(reais(0)).toBe('0,00');
    expect(reais(50)).toBe('0,50');
  });

  it('põe separador de milhar', () => {
    expect(reais(123456)).toBe('1.234,56');
  });
});

describe('candidatosDeKit', () => {
  it('kit não entra em kit (senão a duração vira soma recursiva)', () => {
    const lista = [servico({ id: 'a' }), servico({ id: 'k', isKit: true })];
    expect(candidatosDeKit(lista).map((s) => s.id)).toEqual(['a']);
  });

  it('serviço inativo não entra', () => {
    // Inativo não pode ser agendado sozinho; entrar num kit o faria voltar
    // pela porta dos fundos.
    const lista = [servico({ id: 'a' }), servico({ id: 'b', active: false })];
    expect(candidatosDeKit(lista).map((s) => s.id)).toEqual(['a']);
  });

  it('na edição, o próprio kit sai da lista (não pode se conter)', () => {
    const lista = [servico({ id: 'a' }), servico({ id: 'b' }), servico({ id: 'c' })];
    expect(candidatosDeKit(lista, 'b').map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('lista vazia devolve vazio, sem quebrar', () => {
    expect(candidatosDeKit([])).toEqual([]);
  });
});

describe('rotuloDeDesconto', () => {
  it('percentual aparece como "-10%"', () => {
    expect(rotuloDeDesconto({ discountKind: 'PERCENT', discountValue: 10 })).toBe('-10%');
  });

  it('valor fixo vem em CENTAVOS e sai em reais', () => {
    // discountValue guarda centavos quando o tipo é FIXED. Tratar como reais
    // mostraria "-R$ 500,00" onde o dono cadastrou cinco reais.
    expect(rotuloDeDesconto({ discountKind: 'FIXED', discountValue: 500 })).toBe('-R$ 5,00');
  });

  it('sem desconto não inventa rótulo', () => {
    expect(rotuloDeDesconto({ discountKind: null, discountValue: 0 })).toBe(null);
    expect(rotuloDeDesconto({ discountKind: null, discountValue: 999 })).toBe(null);
  });
});
