import { describe, it, expect } from 'vitest';
import { nextDays, formatPrice, normalizePhone, initials, pad } from './booking.utils';

describe('normalizePhone', () => {
  it('acrescenta o DDI 55 no número digitado com DDD', () => {
    expect(normalizePhone('(11) 99999-8888')).toBe('5511999998888');
    expect(normalizePhone('11 3333-4444')).toBe('551133334444');
  });

  it('NÃO come o DDD 55 do Rio Grande do Sul', () => {
    // É o defeito que a guarda de comprimento existe pra barrar. Um celular de
    // Santa Maria — (55) 99999-9999 — vira '55999999999': 11 dígitos, começa
    // com 55 e não tem DDI. Sem a guarda, o DDD sumia e o número ia pro banco
    // como 5599999999, que não existe.
    expect(normalizePhone('(55) 99999-9999')).toBe('5555999999999');
    expect(normalizePhone('(55) 3333-4444')).toBe('555533334444');
  });

  it('não duplica o DDI quando ele já veio', () => {
    // 12 dígitos = 55 + DDD + fixo de 8. Já está em E.164.
    expect(normalizePhone('551133334444')).toBe('551133334444');
    expect(normalizePhone('5511999998888')).toBe('5511999998888');
    expect(normalizePhone('+55 11 99999-8888')).toBe('5511999998888');
  });
});

describe('formatPrice', () => {
  it('mostra reais com vírgula', () => {
    expect(formatPrice(2500)).toBe('R$ 25,00');
    expect(formatPrice(6050)).toBe('R$ 60,50');
    expect(formatPrice(199)).toBe('R$ 1,99');
  });

  it('preço zero não vira "R$ 0,00", vira nada', () => {
    // Serviço sem preço cadastrado não deve anunciar que é de graça.
    expect(formatPrice(0)).toBe('');
  });
});

describe('initials', () => {
  it('pega a primeira letra do primeiro e do segundo nome', () => {
    expect(initials('João Silva')).toBe('JS');
    expect(initials('  Maria   Aparecida  ')).toBe('MA');
  });

  it('nome de uma palavra só devolve uma letra', () => {
    expect(initials('João')).toBe('J');
  });

  it('nome vazio não quebra', () => {
    expect(initials('')).toBe('');
    expect(initials('   ')).toBe('');
  });
});

describe('nextDays', () => {
  const BASE = new Date(2026, 7, 31); // 31/08/2026, uma segunda-feira

  it('devolve a quantidade pedida a partir da base', () => {
    const dias = nextDays(3, BASE);
    expect(dias.map((d) => d.iso)).toEqual(['2026-08-31', '2026-09-01', '2026-09-02']);
  });

  it('atravessa a virada de mês sem furar', () => {
    // Este é o motivo de `base` ser parâmetro: com `new Date()` embutido, o
    // teste passaria 28 dias por mês e falharia nos outros dois.
    const dias = nextDays(2, new Date(2026, 11, 31));
    expect(dias.map((d) => d.iso)).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('traz o dia da semana em português', () => {
    const [primeiro] = nextDays(1, BASE);
    expect(primeiro.weekday).toBe('seg');
    expect(primeiro.day).toBe(31);
    expect(primeiro.wd).toBe(1);
  });
});

describe('pad', () => {
  it('completa com zero à esquerda', () => {
    expect(pad(9)).toBe('09');
    expect(pad(10)).toBe('10');
    expect(pad(0)).toBe('00');
  });
});
