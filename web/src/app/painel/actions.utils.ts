// ---------------------------------------------------------------------------
// Leitura dos formulários do painel: o que o dono digitou vira o corpo enviado
// à API. Metade disto é dinheiro.
//
// Mora FORA do actions.ts por obrigação, não por gosto: aquele arquivo é
// 'use server', e num módulo de server action TODO export precisa ser função
// async. Uma função síncrona exportada de lá quebra o build do Next. Era por
// isso que estas quatro estavam presas como privadas, sem teste possível.
// ---------------------------------------------------------------------------

/**
 * Valor em reais digitado -> CENTAVOS.
 *
 * Aceita vírgula (é o que o teclado brasileiro produz) e devolve 0 para o que
 * não for número — nunca NaN, que viraria `null` no JSON e faria o backend
 * recusar o serviço inteiro.
 *
 * O arredondamento não é enfeite: 19.90 * 100 dá 1989.9999999999998 em ponto
 * flutuante, e truncar tiraria um centavo de cada serviço cadastrado.
 */
export function reais(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Math.round((Number.isFinite(n) ? n : 0) * 100);
}

/** Dias de follow-up: campo vazio vira null (= sem lembrete de retorno). */
export function followUpDays(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Desconto do formulário na unidade que o backend espera: PERCENT em % inteiro,
 * FIXED em CENTAVOS. As duas unidades convivem no mesmo campo da tela, e é aí
 * que mora o erro caro — mandar 5 (reais) onde o backend lê 5 centavos, ou 500
 * onde ele lê 500%.
 *
 * Tipo em branco, ou valor em branco, significa SEM desconto: o dono pode
 * escolher o tipo e desistir sem preencher, e isso não pode virar desconto zero
 * gravado como se fosse uma promoção ativa.
 */
export function discount(form: FormData): {
  discountKind: 'PERCENT' | 'FIXED' | null;
  discountValue: number;
} {
  const kind = String(form.get('discountKind') ?? '').trim();
  const raw = String(form.get('discountValue') ?? '').trim();
  if ((kind !== 'PERCENT' && kind !== 'FIXED') || !raw) {
    return { discountKind: null, discountValue: 0 };
  }
  if (kind === 'PERCENT') {
    const n = Math.round(Number(raw.replace(',', '.')));
    return { discountKind: 'PERCENT', discountValue: Number.isFinite(n) ? n : 0 };
  }
  return { discountKind: 'FIXED', discountValue: reais(raw) };
}

/**
 * Campos de kit do formulário.
 *
 * `isKit` aceita 'on' E 'true' porque as duas coisas chegam: 'on' é o que um
 * checkbox marcado envia, e 'true' é o que o hidden da EDIÇÃO envia (lá o
 * toggle é travado). Aceitar só um dos dois faria a composição do kit ser
 * descartada num dos dois caminhos.
 */
export function kit(form: FormData): { isKit: boolean; kitMemberIds: string[] } {
  const isKit = form.get('isKit') === 'on' || form.get('isKit') === 'true';
  const kitMemberIds = form.getAll('kitMemberIds').map((v) => String(v)).filter(Boolean);
  return { isKit, kitMemberIds };
}
