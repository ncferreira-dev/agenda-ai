import { describe, it, expect } from 'vitest';
import { centavosDoTexto, totalEmCentavos, itensParaSalvar } from './itens.utils';
import { brl } from '@/lib/format';

// ---------------------------------------------------------------------------
// Dinheiro do atendimento: o que o dono digita, o que ele lê e o que é gravado.
// Errar um centavo aqui é errar o faturamento dele.
// ---------------------------------------------------------------------------

describe('centavosDoTexto', () => {
  it('converte o que o teclado brasileiro produz', () => {
    expect(centavosDoTexto('19,90')).toBe(1990);
    expect(centavosDoTexto('0,50')).toBe(50);
    expect(centavosDoTexto('100')).toBe(10000);
  });

  it('aceita ponto também, pra quem digita no teclado numérico', () => {
    expect(centavosDoTexto('19.90')).toBe(1990);
  });

  it('não perde centavo pro ponto flutuante', () => {
    // 19.90 * 100 dá 1989.9999999999998 em JS. Sem o arredondamento, cada item
    // perderia um centavo — e o total do dono fecharia errado todo mês.
    expect(centavosDoTexto('19,90')).toBe(1990);
    expect(centavosDoTexto('8,70')).toBe(870);
    expect(centavosDoTexto('1,10')).toBe(110);
    expect(centavosDoTexto('2,90')).toBe(290);
  });

  it('texto inválido vira 0, e nunca NaN', () => {
    // NaN somado ao total contamina o valor inteiro: a tela mostraria "R$ NaN"
    // e o formulário mandaria null pro servidor.
    for (const lixo of ['', 'abc', '   ', 'R$']) {
      expect(centavosDoTexto(lixo), lixo).toBe(0);
      expect(Number.isNaN(centavosDoTexto(lixo))).toBe(false);
    }
  });
});

describe('totalEmCentavos', () => {
  it('soma as linhas', () => {
    const total = totalEmCentavos([
      { name: 'Corte', preco: '40,00' },
      { name: 'Barba', preco: '25,00' },
      { name: 'Pomada', preco: '19,90' },
    ]);
    expect(total).toBe(8490);
    expect(brl(total)).toBe((84.9).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  });

  it('lista vazia é zero, não NaN', () => {
    expect(totalEmCentavos([])).toBe(0);
  });

  it('a linha em branco que o editor cria não estraga o total', () => {
    expect(totalEmCentavos([{ name: 'Corte', preco: '40,00' }, { name: '', preco: '' }])).toBe(4000);
  });

  it('preço digitado sem nome NÃO entra no total (é o que seria descartado)', () => {
    // DEFEITO ACHADO POR ESTE TESTE: antes o total somava a linha sem nome, mas
    // o salvamento a descartava. Quem digitasse o preço antes do nome via um
    // valor na tela e gravava outro no banco.
    expect(totalEmCentavos([{ name: 'Corte', preco: '40,00' }, { name: '', preco: '99,99' }])).toBe(4000);
  });
});

describe('itensParaSalvar', () => {
  it('manda nome aparado e preço em centavos', () => {
    expect(itensParaSalvar([{ name: '  Corte  ', preco: '40,00' }])).toEqual([
      { name: 'Corte', priceCents: 4000 },
    ]);
  });

  it('descarta linha sem nome', () => {
    // O editor começa com uma linha em branco; ela não pode virar item.
    expect(
      itensParaSalvar([
        { name: 'Corte', preco: '40,00' },
        { name: '   ', preco: '10,00' },
      ]),
    ).toEqual([{ name: 'Corte', priceCents: 4000 }]);
  });

  it('item de cortesia (preço zero) COM nome continua valendo', () => {
    // Zerar o preço é o jeito de registrar um mimo sem cobrar. Descartar por
    // preço zero tiraria o item da nota do cliente.
    expect(itensParaSalvar([{ name: 'Café', preco: '0,00' }])).toEqual([
      { name: 'Café', priceCents: 0 },
    ]);
  });

  it('o total da tela bate com a soma do que é gravado', () => {
    // As duas contas eram escritas separadamente no ItemsEditor. Este teste é o
    // que impede a tela de mostrar um valor e o banco receber outro.
    const linhas = [
      { name: 'Corte', preco: '40,00' },
      { name: '', preco: '99,99' },
      { name: 'Barba', preco: '25,50' },
    ];
    const somaDoQueGrava = itensParaSalvar(linhas).reduce((s, i) => s + i.priceCents, 0);
    // O que a tela mostra e o que o banco recebe têm de ser o MESMO número.
    // Este é o teste que impede a divergência de voltar.
    expect(totalEmCentavos(linhas)).toBe(somaDoQueGrava);
    expect(somaDoQueGrava).toBe(6550);
  });
});
