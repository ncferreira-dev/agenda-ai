import { describe, it, expect } from 'vitest';
import { reais, followUpDays, discount, kit } from './actions.utils';

// ---------------------------------------------------------------------------
// Leitura dos formulários do painel. Metade disto é dinheiro: é o que o dono
// digita virando o corpo que vai pro banco.
// ---------------------------------------------------------------------------

function formulario(campos: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) {
    for (const item of Array.isArray(v) ? v : [v]) f.append(k, item);
  }
  return f;
}

describe('reais → centavos', () => {
  it('aceita vírgula e ponto', () => {
    expect(reais('40,00')).toBe(4000);
    expect(reais('40.00')).toBe(4000);
    expect(reais('0,50')).toBe(50);
  });

  it('não perde centavo pro ponto flutuante', () => {
    // 19.90 * 100 dá 1989.9999999999998 em JS. Truncar tiraria um centavo de
    // cada serviço cadastrado.
    expect(reais('19,90')).toBe(1990);
    expect(reais('8,70')).toBe(870);
    expect(reais('1,10')).toBe(110);
  });

  it('campo vazio ou torto vira 0, e nunca NaN', () => {
    // NaN vira null no JSON e faz o backend recusar o serviço inteiro.
    for (const lixo of [null, '', '   ', 'abc', 'R$']) {
      expect(reais(lixo), String(lixo)).toBe(0);
    }
  });
});

describe('followUpDays', () => {
  it('vazio é null (sem lembrete de retorno), e não zero', () => {
    // Zero significaria "lembrar no mesmo dia"; null significa "não lembrar".
    expect(followUpDays('')).toBe(null);
    expect(followUpDays(null)).toBe(null);
    expect(followUpDays('   ')).toBe(null);
  });

  it('número vira inteiro', () => {
    expect(followUpDays('30')).toBe(30);
    expect(followUpDays('29,6')).toBe(null); // vírgula não é número em JS
    expect(followUpDays('29.6')).toBe(30);
  });

  it('texto não numérico vira null, não 0', () => {
    expect(followUpDays('trinta')).toBe(null);
  });
});

describe('discount — duas unidades no mesmo campo', () => {
  it('PERCENT é inteiro de porcentagem', () => {
    expect(discount(formulario({ discountKind: 'PERCENT', discountValue: '10' }))).toEqual({
      discountKind: 'PERCENT', discountValue: 10,
    });
  });

  it('FIXED é CENTAVOS — é o erro caro deste campo', () => {
    // O dono digita "5,00" pensando em cinco reais. Se isto mandasse 5, o
    // backend leria cinco CENTAVOS e o desconto sumiria da tela do cliente.
    expect(discount(formulario({ discountKind: 'FIXED', discountValue: '5,00' }))).toEqual({
      discountKind: 'FIXED', discountValue: 500,
    });
  });

  it('tipo escolhido mas valor em branco NÃO vira promoção de zero', () => {
    // O dono pode abrir o bloco de desconto, escolher o tipo e desistir. Gravar
    // "desconto de 0" deixaria uma promoção ativa mentirosa na página pública.
    expect(discount(formulario({ discountKind: 'PERCENT', discountValue: '' }))).toEqual({
      discountKind: null, discountValue: 0,
    });
  });

  it('sem tipo é sem desconto, mesmo com valor preenchido', () => {
    expect(discount(formulario({ discountKind: '', discountValue: '10' }))).toEqual({
      discountKind: null, discountValue: 0,
    });
  });

  it('tipo desconhecido não passa', () => {
    expect(discount(formulario({ discountKind: 'GRATIS', discountValue: '10' })).discountKind).toBe(null);
  });

  it('formulário sem os campos não quebra', () => {
    expect(discount(new FormData())).toEqual({ discountKind: null, discountValue: 0 });
  });
});

describe('kit', () => {
  it('aceita "on" do checkbox E "true" do hidden da edição', () => {
    // São os dois caminhos reais: 'on' é o que um checkbox marcado envia, e
    // 'true' é o que o hidden da EDIÇÃO envia (lá o toggle é travado).
    // Aceitar só um faria a composição ser descartada num dos dois.
    expect(kit(formulario({ isKit: 'on' })).isKit).toBe(true);
    expect(kit(formulario({ isKit: 'true' })).isKit).toBe(true);
  });

  it('ausente ou qualquer outro valor é falso', () => {
    expect(kit(new FormData()).isKit).toBe(false);
    expect(kit(formulario({ isKit: 'off' })).isKit).toBe(false);
  });

  it('junta todos os membros marcados', () => {
    const r = kit(formulario({ isKit: 'on', kitMemberIds: ['a', 'b', 'c'] }));
    expect(r.kitMemberIds).toEqual(['a', 'b', 'c']);
  });

  it('descarta membro vazio', () => {
    expect(kit(formulario({ kitMemberIds: ['a', '', 'b'] })).kitMemberIds).toEqual(['a', 'b']);
  });
});
