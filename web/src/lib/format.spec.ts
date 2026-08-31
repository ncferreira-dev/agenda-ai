import { describe, it, expect } from 'vitest';
import { maskFormat, isValidCpf } from './format';

// ---------------------------------------------------------------------------
// Máscaras e validação de CPF do front. Puro, sem DOM.
//
// O isValidCpf é espelho do back (api/src/common/cpf.ts) e existe só pra dar
// resposta instantânea no formulário — o servidor continua sendo a fonte da
// verdade. Espelho sem teste é espelho que diverge em silêncio: o front aceita
// o que o servidor recusa, e o dono leva um erro sem entender o motivo.
// ---------------------------------------------------------------------------

describe('maskFormat — telefone', () => {
  it('formata o número completo com DDD', () => {
    expect(maskFormat('phone', '11999998888')).toBe('(11) 99999-8888');
  });

  it('tira o DDI 55 quando ele vem junto', () => {
    // É o formato que o backend grava (E.164). Sem esta remoção, o campo
    // mostrava "(55) 11999-9988" e a pessoa "corrigia" o próprio telefone.
    expect(maskFormat('phone', '5511999998888')).toBe('(11) 99999-8888');
  });

  it('formata fixo de 10 dígitos', () => {
    expect(maskFormat('phone', '1133334444')).toBe('(11) 3333-4444');
  });

  it('acompanha a digitação, sem quebrar no meio', () => {
    expect(maskFormat('phone', '')).toBe('');
    expect(maskFormat('phone', '1')).toBe('(1');
    expect(maskFormat('phone', '11')).toBe('(11');
    expect(maskFormat('phone', '119')).toBe('(11) 9');
    expect(maskFormat('phone', '119999')).toBe('(11) 9999');
  });

  it('ignora o que não é dígito e corta o excesso', () => {
    expect(maskFormat('phone', '(11) 99999-8888')).toBe('(11) 99999-8888');
    // Excesso é cortado pelo fim. Note que o DDI só é removido quando o número
    // REALMENTE começa com 55 — aqui começa com 11, então os 11 primeiros
    // dígitos é que valem.
    expect(maskFormat('phone', '11999998888999')).toBe('(11) 99999-8888');
    // E aqui sim, com 55 na frente, o DDI sai antes do corte.
    expect(maskFormat('phone', '5511999998888')).toBe('(11) 99999-8888');
  });
});

describe('maskFormat — CPF e CEP', () => {
  it('formata o CPF', () => {
    expect(maskFormat('cpf', '52998224725')).toBe('529.982.247-25');
  });

  it('formata o CEP', () => {
    expect(maskFormat('cep', '01310100')).toBe('01310-100');
  });

  it('não passa do tamanho máximo', () => {
    expect(maskFormat('cpf', '529982247259999')).toBe('529.982.247-25');
    expect(maskFormat('cep', '013101009999')).toBe('01310-100');
  });
});

describe('isValidCpf', () => {
  it('aceita CPF com os dois dígitos verificadores corretos', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('529.982.247-25')).toBe(true);
  });

  it('recusa quando o último dígito não confere', () => {
    // Um dígito trocado é o erro de digitação mais comum, e é exatamente o que
    // os verificadores existem pra pegar.
    expect(isValidCpf('52998224726')).toBe(false);
  });

  it('recusa a sequência de dígitos repetidos', () => {
    // 111.111.111-11 PASSA na conta dos verificadores. É rejeitado por regra
    // explícita — sem ela, o CPF inválido mais usado do Brasil entraria.
    for (const d of ['00000000000', '11111111111', '99999999999']) {
      expect(isValidCpf(d), d).toBe(false);
    }
  });

  it('recusa tamanho errado e vazio', () => {
    expect(isValidCpf('')).toBe(false);
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('529982247250')).toBe(false);
  });
});
