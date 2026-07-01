// ---------------------------------------------------------------------------
// Presets por VERTICAL (tipo de negócio) — onboarding "qual é o seu negócio?".
//
// Ao escolher um vertical no onboarding, o negócio já nasce com:
//   - accentColor + tema (pele) sugeridos pra página pública;
//   - uma lista de serviços-base (nome, duração, preço) prontos pra editar;
//   - categorias de produto sugeridas (gancho pra Fase 7 — catálogo; sem uso hoje).
//
// É SÓ config: adicionar um ramo = acrescentar uma entrada aqui. Não confundir
// com src/presets/profissoes.ts, que é o preset de FOLLOW-UP (lembrete de retorno).
//
// Preços em centavos (BRL). São chutes de mercado, editáveis pelo dono depois.
// ---------------------------------------------------------------------------

// As 3 "peles" visuais reutilizáveis. O id é gravado em Business.themePreset e
// a página pública aplica via [data-skin] (ver web/.../booking.module.css).
export type SkinId = 'clean' | 'bold' | 'suave';

export interface Skin {
  id: SkinId;
  label: string;
  description: string;
}

export const SKINS: Skin[] = [
  { id: 'clean', label: 'Clean', description: 'Clarinho e minimalista, cantos suaves. Combina com quase tudo.' },
  { id: 'bold', label: 'Bold', description: 'Contraste forte e títulos marcantes. Presença e atitude.' },
  { id: 'suave', label: 'Suave', description: 'Tons quentes e acolhedores, cantos arredondados. Aconchego.' },
];

const SKIN_IDS = new Set<string>(SKINS.map((s) => s.id));

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && SKIN_IDS.has(value);
}

export interface VerticalServiceBase {
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export interface VerticalPreset {
  id: string; // slug estável do vertical (ex.: "barbearia")
  label: string; // rótulo exibido no card
  emoji: string; // ícone do card (leve, sem asset)
  accentColor: string; // cor da marca sugerida (#RRGGBB)
  temaSugerido: SkinId; // pele sugerida
  servicosBase: VerticalServiceBase[];
  categoriasProdutoSugeridas: string[];
}

export const VERTICAL_PRESETS: VerticalPreset[] = [
  {
    id: 'barbearia',
    label: 'Barbearia',
    emoji: '✂️',
    accentColor: '#1C1C1E',
    temaSugerido: 'bold',
    servicosBase: [
      { name: 'Corte', durationMinutes: 30, priceCents: 4000 },
      { name: 'Barba', durationMinutes: 20, priceCents: 2500 },
      { name: 'Corte + Barba', durationMinutes: 45, priceCents: 6000 },
      { name: 'Acabamento (pezinho)', durationMinutes: 15, priceCents: 1500 },
    ],
    categoriasProdutoSugeridas: ['Pomadas e ceras', 'Óleo para barba', 'Shampoo e cuidados'],
  },
  {
    id: 'salao',
    label: 'Salão de cabelo',
    emoji: '💇',
    accentColor: '#7C3AED',
    temaSugerido: 'suave',
    servicosBase: [
      { name: 'Corte feminino', durationMinutes: 60, priceCents: 8000 },
      { name: 'Escova', durationMinutes: 45, priceCents: 5000 },
      { name: 'Hidratação', durationMinutes: 60, priceCents: 7000 },
      { name: 'Coloração', durationMinutes: 120, priceCents: 15000 },
    ],
    categoriasProdutoSugeridas: ['Shampoo e condicionador', 'Máscaras de tratamento', 'Finalizadores'],
  },
  {
    id: 'nutricionista',
    label: 'Nutricionista',
    emoji: '🥗',
    accentColor: '#1F9D4D',
    temaSugerido: 'clean',
    servicosBase: [
      { name: 'Primeira consulta', durationMinutes: 60, priceCents: 20000 },
      { name: 'Retorno', durationMinutes: 40, priceCents: 12000 },
      { name: 'Avaliação de bioimpedância', durationMinutes: 30, priceCents: 8000 },
    ],
    categoriasProdutoSugeridas: ['Suplementos', 'E-books e planos alimentares'],
  },
  {
    id: 'odontologia',
    label: 'Odontologia',
    emoji: '🦷',
    accentColor: '#0F766E',
    temaSugerido: 'clean',
    servicosBase: [
      { name: 'Avaliação', durationMinutes: 30, priceCents: 0 },
      { name: 'Limpeza (profilaxia)', durationMinutes: 40, priceCents: 15000 },
      { name: 'Restauração', durationMinutes: 60, priceCents: 25000 },
      { name: 'Clareamento', durationMinutes: 60, priceCents: 60000 },
    ],
    categoriasProdutoSugeridas: ['Kits de higiene', 'Clareamento caseiro'],
  },
  {
    id: 'tatuagem',
    label: 'Tatuagem',
    emoji: '🖤',
    accentColor: '#111827',
    temaSugerido: 'bold',
    servicosBase: [
      { name: 'Orçamento / sessão de desenho', durationMinutes: 30, priceCents: 0 },
      { name: 'Tatuagem pequena', durationMinutes: 90, priceCents: 25000 },
      { name: 'Sessão (por hora)', durationMinutes: 60, priceCents: 20000 },
      { name: 'Retoque', durationMinutes: 45, priceCents: 0 },
    ],
    categoriasProdutoSugeridas: ['Pomada cicatrizante', 'Protetor solar', 'Camisetas e arte'],
  },
  {
    id: 'maquiagem',
    label: 'Maquiagem',
    emoji: '💄',
    accentColor: '#DB2777',
    temaSugerido: 'suave',
    servicosBase: [
      { name: 'Maquiagem social', durationMinutes: 60, priceCents: 15000 },
      { name: 'Maquiagem de noiva', durationMinutes: 120, priceCents: 40000 },
      { name: 'Aula de automaquiagem', durationMinutes: 90, priceCents: 20000 },
    ],
    categoriasProdutoSugeridas: ['Pincéis', 'Batons e sombras', 'Kits de brinde'],
  },
  {
    id: 'fisioterapia',
    label: 'Fisioterapia',
    emoji: '💪',
    accentColor: '#1D4ED8',
    temaSugerido: 'clean',
    servicosBase: [
      { name: 'Avaliação', durationMinutes: 50, priceCents: 15000 },
      { name: 'Sessão de fisioterapia', durationMinutes: 50, priceCents: 12000 },
      { name: 'Pilates clínico', durationMinutes: 50, priceCents: 10000 },
    ],
    categoriasProdutoSugeridas: ['Faixas e acessórios', 'Pacotes de sessões'],
  },
  {
    id: 'estetica',
    label: 'Estética',
    emoji: '💆',
    accentColor: '#C2410C',
    temaSugerido: 'suave',
    servicosBase: [
      { name: 'Limpeza de pele', durationMinutes: 60, priceCents: 12000 },
      { name: 'Peeling', durationMinutes: 45, priceCents: 15000 },
      { name: 'Drenagem linfática', durationMinutes: 60, priceCents: 13000 },
      { name: 'Massagem modeladora', durationMinutes: 60, priceCents: 13000 },
    ],
    categoriasProdutoSugeridas: ['Séruns e ácidos', 'Protetor solar', 'Cremes corporais'],
  },
  {
    id: 'banho-e-tosa',
    label: 'Banho e tosa',
    emoji: '🐶',
    accentColor: '#0891B2',
    temaSugerido: 'clean',
    servicosBase: [
      { name: 'Banho', durationMinutes: 40, priceCents: 5000 },
      { name: 'Tosa higiênica', durationMinutes: 40, priceCents: 4000 },
      { name: 'Banho + tosa completa', durationMinutes: 90, priceCents: 9000 },
      { name: 'Corte de unhas', durationMinutes: 15, priceCents: 2000 },
    ],
    categoriasProdutoSugeridas: ['Ração e petiscos', 'Shampoo pet', 'Acessórios e brinquedos'],
  },
  {
    id: 'manicure',
    label: 'Manicure',
    emoji: '💅',
    accentColor: '#E11D48',
    temaSugerido: 'suave',
    servicosBase: [
      { name: 'Manicure', durationMinutes: 40, priceCents: 3500 },
      { name: 'Pedicure', durationMinutes: 45, priceCents: 4000 },
      { name: 'Mão e pé', durationMinutes: 75, priceCents: 7000 },
      { name: 'Alongamento em gel', durationMinutes: 120, priceCents: 15000 },
    ],
    categoriasProdutoSugeridas: ['Esmaltes', 'Cuidados de cutícula', 'Kits de manutenção'],
  },
  {
    id: 'sobrancelhas',
    label: 'Sobrancelhas',
    emoji: '👁️',
    accentColor: '#9333EA',
    temaSugerido: 'suave',
    servicosBase: [
      { name: 'Design de sobrancelhas', durationMinutes: 30, priceCents: 4000 },
      { name: 'Design com henna', durationMinutes: 45, priceCents: 6000 },
      { name: 'Micropigmentação', durationMinutes: 120, priceCents: 40000 },
    ],
    categoriasProdutoSugeridas: ['Henna e tintas', 'Pinças e acessórios'],
  },
  {
    id: 'psicologia',
    label: 'Psicologia',
    emoji: '🌱',
    accentColor: '#0F766E',
    temaSugerido: 'clean',
    servicosBase: [
      { name: 'Sessão de terapia', durationMinutes: 50, priceCents: 18000 },
      { name: 'Primeira sessão', durationMinutes: 60, priceCents: 18000 },
      { name: 'Sessão de casal', durationMinutes: 60, priceCents: 25000 },
    ],
    categoriasProdutoSugeridas: ['E-books', 'Pacotes de sessões'],
  },
  {
    id: 'personal',
    label: 'Personal trainer',
    emoji: '🏋️',
    accentColor: '#B91C1C',
    temaSugerido: 'bold',
    servicosBase: [
      { name: 'Aula avulsa', durationMinutes: 60, priceCents: 8000 },
      { name: 'Avaliação física', durationMinutes: 45, priceCents: 10000 },
      { name: 'Montagem de treino', durationMinutes: 30, priceCents: 12000 },
    ],
    categoriasProdutoSugeridas: ['Planilhas de treino', 'Suplementos', 'Acessórios'],
  },
  {
    id: 'massoterapia',
    label: 'Massoterapia',
    emoji: '🧘',
    accentColor: '#0D9488',
    temaSugerido: 'suave',
    servicosBase: [
      { name: 'Massagem relaxante', durationMinutes: 60, priceCents: 12000 },
      { name: 'Massagem desportiva', durationMinutes: 60, priceCents: 14000 },
      { name: 'Quick massage', durationMinutes: 30, priceCents: 6000 },
      { name: 'Pedras quentes', durationMinutes: 75, priceCents: 16000 },
    ],
    categoriasProdutoSugeridas: ['Óleos e velas', 'Aromaterapia'],
  },
  {
    id: 'podologia',
    label: 'Podologia',
    emoji: '🦶',
    accentColor: '#2563EB',
    temaSugerido: 'clean',
    servicosBase: [
      { name: 'Podologia completa', durationMinutes: 60, priceCents: 9000 },
      { name: 'Tratamento de unha encravada', durationMinutes: 45, priceCents: 10000 },
      { name: 'Reflexologia', durationMinutes: 40, priceCents: 8000 },
    ],
    categoriasProdutoSugeridas: ['Cremes para os pés', 'Palmilhas e acessórios'],
  },
];

/** Preset por id, ou null se não existir. */
export function getVertical(id: string): VerticalPreset | null {
  return VERTICAL_PRESETS.find((v) => v.id === id) ?? null;
}
