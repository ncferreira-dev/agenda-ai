// ---------------------------------------------------------------------------
// Presets de follow-up por profissão/ramo.
//
// Fallback determinístico (e instantâneo) pra sugestão de "lembrar de refazer":
// quando NÃO há ANTHROPIC_API_KEY, quando a IA falha, ou só pra dar um chute bom
// a partir de palavras-chave no texto do serviço. A IA (SuggestionService) é a
// camada esperta por cima disto; este arquivo é a rede de segurança.
//
// Adicionar uma profissão nova = só acrescentar uma entrada aqui. É config.
//
// followUpDays: intervalo típico de retorno daquele ramo.
// message: template em pt-BR com placeholders {nome} / {servico} / {negocio}.
// keywords: termos que casam com o nome/descrição do serviço ou a profissão.
// ---------------------------------------------------------------------------

export interface ProfessionPreset {
  label: string;
  followUpDays: number;
  message: string;
  keywords: string[];
}

export const PROFESSION_PRESETS: ProfessionPreset[] = [
  {
    label: 'Barbearia',
    followUpDays: 21,
    message:
      'Oi {nome}! Já faz um tempinho do seu {servico} na {negocio} ✂️ Tá na hora de dar aquele tapa no visual. Quer marcar? É só me chamar por aqui.',
    keywords: ['barbearia', 'barbeiro', 'corte', 'barba', 'cabelo masculino', 'degrade', 'degradê'],
  },
  {
    label: 'Salão de cabelo',
    followUpDays: 30,
    message:
      'Oi {nome}! Já faz um mês do seu {servico} na {negocio} 💇 Que tal renovar o look? Me chama aqui que a gente marca.',
    keywords: ['salão', 'salao', 'cabeleireiro', 'escova', 'hidratação', 'hidratacao', 'coloração', 'coloracao', 'mechas', 'progressiva'],
  },
  {
    label: 'Manicure / Pedicure',
    followUpDays: 15,
    message:
      'Oi {nome}! Suas unhas já devem estar pedindo um carinho 💅 Faz {servico} de novo na {negocio}? Me chama que eu encaixo.',
    keywords: ['manicure', 'pedicure', 'unha', 'esmalt', 'gel', 'alongamento de unha'],
  },
  {
    label: 'Designer de sobrancelhas',
    followUpDays: 21,
    message:
      'Oi {nome}! Suas sobrancelhas já devem estar querendo um ajuste 😍 Bora fazer {servico} na {negocio}? É só me chamar.',
    keywords: ['sobrancelha', 'designer de sobrancelha', 'henna', 'micropigmentação', 'micropigmentacao'],
  },
  {
    label: 'Maquiagem',
    followUpDays: 45,
    message:
      'Oi {nome}! Tem algum evento chegando? Posso reservar seu {servico} na {negocio} 💄 Me chama aqui!',
    keywords: ['maquiagem', 'maquiador', 'make', 'noiva', 'penteado'],
  },
  {
    label: 'Estética facial/corporal',
    followUpDays: 30,
    message:
      'Oi {nome}! Pra manter o resultado, o ideal é não espaçar muito 💆 Vamos marcar seu próximo {servico} na {negocio}? Me chama.',
    keywords: ['estética', 'estetica', 'limpeza de pele', 'peeling', 'drenagem', 'massagem facial', 'facial', 'corporal'],
  },
  {
    label: 'Tatuagem',
    followUpDays: 30,
    message:
      'Oi {nome}! Que tal dar continuidade no projeto da sua tattoo? 🖤 Posso reservar um horário pra {servico} na {negocio}.',
    keywords: ['tatuagem', 'tattoo', 'tatuador', 'retoque', 'piercing'],
  },
  {
    label: 'Nutricionista',
    followUpDays: 30,
    message:
      'Oi {nome}! Já faz um mês da sua {servico} na {negocio} 🥗 Bora marcar o retorno pra acompanhar sua evolução? Me chama aqui.',
    keywords: ['nutricion', 'nutri', 'dieta', 'alimentar', 'reeducação alimentar', 'reeducacao alimentar'],
  },
  {
    label: 'Odontologia',
    followUpDays: 180,
    message:
      'Oi {nome}! Já faz um tempo da sua última {servico} na {negocio} 🦷 É hora da revisão pra manter tudo em dia. Quer agendar?',
    keywords: ['odonto', 'dentista', 'dental', 'limpeza dental', 'profilaxia', 'clareamento'],
  },
  {
    label: 'Fisioterapia',
    followUpDays: 7,
    message:
      'Oi {nome}! Pra não perder o progresso, o ideal é manter a frequência 💪 Vamos marcar sua próxima {servico} na {negocio}?',
    keywords: ['fisio', 'fisioterap', 'reabilitação', 'reabilitacao', 'pilates clínico', 'rpg'],
  },
  {
    label: 'Psicologia',
    followUpDays: 7,
    message:
      'Oi {nome}! Passando pra reservar nosso próximo encontro 🌱 Quer manter o mesmo horário pra {servico} na {negocio}?',
    keywords: ['psicolog', 'terapia', 'psicoterapia', 'terapeuta'],
  },
  {
    label: 'Personal trainer',
    followUpDays: 5,
    message:
      'Oi {nome}! Bora manter o ritmo do treino? 🏋️ Posso já deixar marcado seu próximo {servico} na {negocio}.',
    keywords: ['personal', 'treino', 'treinador', 'academia', 'musculação', 'musculacao'],
  },
  {
    label: 'Massoterapia',
    followUpDays: 21,
    message:
      'Oi {nome}! Seu corpo já deve estar pedindo um relaxamento 💆 Vamos marcar sua próxima {servico} na {negocio}?',
    keywords: ['massagem', 'massoterap', 'relaxante', 'quick massage', 'shiatsu'],
  },
  {
    label: 'Podologia',
    followUpDays: 30,
    message:
      'Oi {nome}! Já faz um mês da sua {servico} na {negocio} 🦶 Pra manter os pés saudáveis, bora marcar o retorno? Me chama aqui.',
    keywords: ['podolog', 'pé', 'pes', 'unha encravada', 'calos'],
  },
  {
    label: 'Banho e tosa / Pet',
    followUpDays: 30,
    message:
      'Oi {nome}! O pet já deve estar precisando de um trato 🐶 Bora marcar o próximo {servico} na {negocio}? Me chama aqui!',
    keywords: ['banho', 'tosa', 'pet', 'veterin', 'vet', 'animal'],
  },
];

// Template usado quando o serviço não tem mensagem própria e nada casou.
export const DEFAULT_FOLLOWUP_MESSAGE =
  'Oi {nome}! Já faz um tempinho do seu {servico} na {negocio}. Quer marcar o próximo? É só me chamar por aqui 😊';

export const DEFAULT_FOLLOWUP_DAYS = 30;

// Acha o melhor preset por casamento de palavra-chave no texto (profissão + serviço).
// Retorna null se nada casar (aí quem chama usa o default).
export function matchPreset(...texts: (string | null | undefined)[]): ProfessionPreset | null {
  const haystack = texts
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!haystack.trim()) return null;
  for (const preset of PROFESSION_PRESETS) {
    if (preset.keywords.some((k) => haystack.includes(k))) return preset;
  }
  return null;
}
