// ---------------------------------------------------------------------------
// Conversão de dinheiro digitado no editor de itens do atendimento.
//
// A mesma conta estava escrita DUAS VEZES dentro do ItemsEditor: uma pro total
// que aparece na tela e outra pro JSON que vai pro servidor. Duas cópias da
// regra de dinheiro é o convite mais claro que existe pra a tela mostrar um
// valor e o banco gravar outro — bastava alguém ajustar uma delas.
// ---------------------------------------------------------------------------

export interface LinhaDeItem {
  name: string;
  preco: string; // em reais, como o dono digitou ("19,90")
}

/**
 * "19,90" -> 1990. Aceita vírgula (é o que o teclado brasileiro produz) e
 * devolve 0 pro que não for número, em vez de NaN — NaN somado ao total
 * contamina o valor inteiro e a tela mostra "R$ NaN".
 *
 * O Math.round não é decorativo: 19.90 * 100 dá 1989.9999999999998 em ponto
 * flutuante, e truncar geraria uma diferença de um centavo por item.
 */
export function centavosDoTexto(preco: string): number {
  return Math.round((Number((preco ?? '').replace(',', '.')) || 0) * 100);
}

/**
 * Total do atendimento, em centavos — o número que o dono lê na tela.
 *
 * Soma SÓ o que vai ser gravado. Antes somava toda linha digitada, inclusive a
 * que ainda não tem nome, e essa é descartada no salvamento: quem digitasse o
 * preço antes do nome via "R$ 165,49" na tela e gravava "R$ 65,50" no banco,
 * sem nenhum aviso. A tela e o banco precisam dizer o mesmo número.
 */
export function totalEmCentavos(linhas: LinhaDeItem[]): number {
  return itensParaSalvar(linhas).reduce((soma, item) => soma + item.priceCents, 0);
}

/**
 * O que de fato vai pro servidor. Linha sem nome é descartada: o editor começa
 * com uma linha em branco e o dono pode deixar sobrando, e item sem nome não
 * significa nada na nota do cliente.
 */
export function itensParaSalvar(linhas: LinhaDeItem[]): Array<{ name: string; priceCents: number }> {
  return linhas
    .map((l) => ({ name: l.name.trim(), priceCents: centavosDoTexto(l.preco) }))
    .filter((it) => it.name);
}
