// Slug da página pública do negócio (seudominio.com/<slug>). Fonte única das
// regras, reusada pelo cadastro (gera) e pelo painel (valida o que o dono edita).

// Slugs reservados: colidiriam com rotas do app/site (Next + API pública).
export const RESERVED_SLUGS = new Set([
  'painel', 'login', 'logout', 'cadastro', 'registro', 'api', 'b', 'admin', 'app',
  'www', 'sobre', 'precos', 'termos', 'privacidade', 'contato', 'ajuda',
  'negocio', 'agendamento', 'agendar', 'static', '_next', 'assets',
]);

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

// Formato válido: minúsculas, [a-z0-9-], sem hífen nas pontas nem duplo.
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Transforma um texto livre (nome do negócio) num slug base: remove acentos,
 * troca o que não é [a-z0-9] por hífen, colapsa/apara hífens. Pode devolver ''
 * (ex.: nome só com símbolos) — quem chama trata o fallback.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acentos (marcas diacríticas do NFD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // não-alfanumérico vira hífen
    .replace(/^-+|-+$/g, '') // apara hífen das pontas
    .replace(/-{2,}/g, '-'); // colapsa hífens repetidos
}
