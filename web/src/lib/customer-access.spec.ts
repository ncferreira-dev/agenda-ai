import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { salvarAcesso, lerAcesso, limparAcesso, capturarAcessoDaUrl } from './customer-access';

// ---------------------------------------------------------------------------
// Guarda do token de acesso do cliente final.
//
// O caso que mais importa aqui é o que NÃO se vê em desenvolvimento:
// localStorage LANÇA — não devolve null — em aba anônima do Safari e com
// cookies de site bloqueados. O código tem try/catch por causa disso, mas até
// agora era uma afirmação sem prova: se alguém tirasse o try/catch, a página
// quebrava inteira justamente para quem acabou de agendar, e nenhum teste
// acusaria.
// ---------------------------------------------------------------------------

function comLocalStorageQuebrado(metodo: 'setItem' | 'getItem' | 'removeItem') {
  return vi.spyOn(Storage.prototype, metodo).mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('guarda por negócio', () => {
  it('salva e lê o token do mesmo slug', () => {
    salvarAcesso('barbearia-do-ze', 'tok-123');
    expect(lerAcesso('barbearia-do-ze')).toBe('tok-123');
  });

  it('token de um negócio não vaza para outro', () => {
    // Quem agenda no salão A e na barbearia B tem dois tokens, e um nunca serve
    // para o outro — o backend recusaria, mas a tela nem deve tentar.
    salvarAcesso('salao-a', 'tok-a');
    salvarAcesso('barbearia-b', 'tok-b');
    expect(lerAcesso('salao-a')).toBe('tok-a');
    expect(lerAcesso('barbearia-b')).toBe('tok-b');
  });

  it('sem token guardado devolve null', () => {
    expect(lerAcesso('nunca-agendei')).toBe(null);
  });

  it('limpar apaga só o do slug pedido', () => {
    salvarAcesso('a', 'tok-a');
    salvarAcesso('b', 'tok-b');
    limparAcesso('a');
    expect(lerAcesso('a')).toBe(null);
    expect(lerAcesso('b')).toBe('tok-b');
  });
});

describe('localStorage indisponível (aba anônima do Safari)', () => {
  it('salvar não derruba a página quando o navegador recusa', () => {
    const espia = comLocalStorageQuebrado('setItem');
    expect(() => salvarAcesso('slug', 'tok')).not.toThrow();
    expect(espia).toHaveBeenCalled();
  });

  it('ler devolve null em vez de propagar a exceção', () => {
    comLocalStorageQuebrado('getItem');
    expect(() => lerAcesso('slug')).not.toThrow();
    expect(lerAcesso('slug')).toBe(null);
  });

  it('limpar não derruba a página', () => {
    comLocalStorageQuebrado('removeItem');
    expect(() => limparAcesso('slug')).not.toThrow();
  });
});

describe('token que chega pelo link (?t=)', () => {
  it('captura, guarda e SOME da barra de endereço', () => {
    window.history.replaceState({}, '', '/barbearia-do-ze?t=tok-do-whatsapp');

    expect(capturarAcessoDaUrl('barbearia-do-ze')).toBe('tok-do-whatsapp');
    expect(lerAcesso('barbearia-do-ze')).toBe('tok-do-whatsapp');
    // Sair da URL é parte da funcionalidade, não detalhe: token na barra de
    // endereço vaza em print, no histórico e no Referer do próximo clique.
    expect(window.location.search).not.toContain('t=');
  });

  it('preserva os outros parâmetros da URL', () => {
    window.history.replaceState({}, '', '/barbearia-do-ze?utm_source=insta&t=tok');
    capturarAcessoDaUrl('barbearia-do-ze');
    expect(window.location.search).toContain('utm_source=insta');
    expect(window.location.search).not.toContain('t=tok');
  });

  it('sem ?t= não mexe em nada', () => {
    window.history.replaceState({}, '', '/barbearia-do-ze');
    expect(capturarAcessoDaUrl('barbearia-do-ze')).toBe(null);
    expect(lerAcesso('barbearia-do-ze')).toBe(null);
  });
});
