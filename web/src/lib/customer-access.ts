// ---------------------------------------------------------------------------
// Guarda o token de acesso do cliente final (o que o backend devolve ao
// agendar). Fica por negócio: quem agenda no salão A e na barbearia B tem dois
// tokens, e um nunca serve pro outro.
//
// Tudo dentro de try/catch porque localStorage LANÇA — não devolve null — em
// aba anônima do Safari e com cookies de site bloqueados. Sem isso a página
// inteira quebrava para esse visitante, e a falha é justamente no caminho em
// que ele acabou de agendar.
// ---------------------------------------------------------------------------

const prefixo = 'agendai:acesso:';

export function salvarAcesso(slug: string, token: string): void {
  try {
    window.localStorage.setItem(prefixo + slug, token);
  } catch {
    // Sem persistência o cliente ainda vê a confirmação na tela desta sessão;
    // só não volta depois sem o link. Melhor que derrubar a página.
  }
}

export function lerAcesso(slug: string): string | null {
  try {
    return window.localStorage.getItem(prefixo + slug);
  } catch {
    return null;
  }
}

export function limparAcesso(slug: string): void {
  try {
    window.localStorage.removeItem(prefixo + slug);
  } catch {
    /* nada a fazer */
  }
}

/**
 * Pega o token de `?t=` na URL, guarda e limpa a barra de endereço. É assim que
 * o link de "meus agendamentos" enviado por WhatsApp funciona em qualquer
 * aparelho — inclusive num que nunca agendou aqui.
 */
export function capturarAcessoDaUrl(slug: string): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const t = url.searchParams.get('t');
  if (!t) return null;
  salvarAcesso(slug, t);
  // Tira o token da barra de endereço pra não vazar em print, histórico ou
  // no Referer de qualquer link que a pessoa clique depois.
  url.searchParams.delete('t');
  window.history.replaceState({}, '', url.toString());
  return t;
}
