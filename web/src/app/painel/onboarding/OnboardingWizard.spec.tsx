import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Me, Skin, VerticalPreset } from '@/lib/panel-api';

vi.mock('../actions', () => ({
  applyVertical: vi.fn(),
  finishOnboarding: vi.fn(),
  skipOnboarding: vi.fn(),
}));

// Mesmo motivo do ItemsEditor.spec: useFormState/useFormStatus vêm do react-dom
// que o NEXT empacota, e não existem fora dele. Duplicado de propósito — é o
// segundo caso, e a regra do projeto é só subir para um lugar comum no terceiro.
vi.mock('react-dom', async (original) => {
  const real = await original<typeof import('react-dom')>();
  return {
    ...real,
    useFormState: (_acao: unknown, inicial: unknown) => [inicial, vi.fn()],
    useFormStatus: () => ({ pending: false }),
  };
});

import { applyVertical } from '../actions';
import { OnboardingWizard } from './OnboardingWizard';

const BARBEARIA: VerticalPreset = {
  id: 'barbearia',
  label: 'Barbearia',
  emoji: '💈',
  accentColor: '#1F4D3A',
  temaSugerido: 'bold',
  servicosBase: [
    { name: 'Corte', durationMinutes: 30, priceCents: 4000 },
    { name: 'Barba', durationMinutes: 20, priceCents: 2500 },
  ],
  categoriasProdutoSugeridas: [],
};

const SALAO: VerticalPreset = {
  ...BARBEARIA,
  id: 'salao',
  label: 'Salão',
  emoji: '💇',
  accentColor: '#DB2777',
  temaSugerido: 'suave',
  servicosBase: [{ name: 'Escova', durationMinutes: 45, priceCents: 6000 }],
};

const SKINS: Skin[] = [
  { id: 'clean', label: 'Clean', description: 'Sóbrio' },
  { id: 'bold', label: 'Bold', description: 'Marcante' },
];

const NEGOCIO = { accentColor: null, themePreset: null, logoUrl: null } as unknown as Me['business'];

function montar(over: Partial<Parameters<typeof OnboardingWizard>[0]> = {}) {
  return render(
    <OnboardingWizard
      ownerName="José Carlos da Silva"
      business={NEGOCIO}
      verticais={[BARBEARIA, SALAO]}
      skins={SKINS}
      {...over}
    />,
  );
}

beforeEach(() => vi.mocked(applyVertical).mockReset());

describe('passo 1 — escolher o tipo de negócio', () => {
  it('cumprimenta pelo primeiro nome, e não pelo nome inteiro', () => {
    montar();
    expect(screen.getByText(/Olá, José/)).toBeInTheDocument();
    expect(screen.queryByText(/José Carlos da Silva/)).not.toBeInTheDocument();
  });

  it('mostra quantos serviços cada tipo já traz pronto', () => {
    montar();
    expect(screen.getByText('2 serviços prontos')).toBeInTheDocument();
    expect(screen.getByText('1 serviços prontos')).toBeInTheDocument();
  });

  it('aplica o vertical escolhido com o tema sugerido dele', async () => {
    vi.mocked(applyVertical).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByText('Barbearia'));

    expect(applyVertical).toHaveBeenCalledWith('barbearia', 'bold');
  });
});

describe('quando aplicar o vertical FALHA', () => {
  it('NÃO avança de passo e mostra o erro', async () => {
    // É a regra que mais importa aqui. Se avançasse, o dono estaria escolhendo
    // cor e estilo para serviços que nunca foram criados — e sairia do
    // onboarding achando que a agenda dele está montada.
    vi.mocked(applyVertical).mockResolvedValue({ ok: false, error: 'Falha ao aplicar.' });
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByText('Barbearia'));

    expect(await screen.findByText('Falha ao aplicar.')).toBeInTheDocument();
    // Continua no passo 1: os cards de tipo seguem na tela.
    expect(screen.getByText('Qual é o seu negócio?')).toBeInTheDocument();
    expect(screen.queryByText('Deixe com a sua cara')).not.toBeInTheDocument();
  });

  it('erro sem mensagem do servidor ainda avisa alguma coisa', async () => {
    vi.mocked(applyVertical).mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByText('Salão'));

    expect(await screen.findByText(/Não foi possível aplicar/)).toBeInTheDocument();
  });
});

describe('passo 2 — aparência', () => {
  beforeEach(() => vi.mocked(applyVertical).mockResolvedValue({ ok: true }));

  async function irParaOPasso2() {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByText('Barbearia'));
    expect(await screen.findByText('Deixe com a sua cara')).toBeInTheDocument();
    return user;
  }

  it('herda a cor e o tema do vertical escolhido', async () => {
    await irParaOPasso2();

    // Os hidden inputs são o que de fato é enviado ao servidor — testar o
    // destaque visual do botão deixaria passar um estado bonito que não salva.
    const cor = document.querySelector('input[name="accentColor"]') as HTMLInputElement;
    const tema = document.querySelector('input[name="themePreset"]') as HTMLInputElement;
    expect(cor.value).toBe('#1F4D3A');
    expect(tema.value).toBe('bold');
  });

  it('diz quantos serviços foram criados', async () => {
    await irParaOPasso2();
    expect(screen.getByText(/Criamos 2 serviços/)).toBeInTheDocument();
  });

  it('trocar a cor muda o que vai ser salvo', async () => {
    const user = await irParaOPasso2();

    await user.click(screen.getByLabelText('#1D4ED8'));

    const cor = document.querySelector('input[name="accentColor"]') as HTMLInputElement;
    expect(cor.value).toBe('#1D4ED8');
  });

  it('trocar o estilo muda o que vai ser salvo', async () => {
    const user = await irParaOPasso2();

    await user.click(screen.getByText('Clean'));

    const tema = document.querySelector('input[name="themePreset"]') as HTMLInputElement;
    expect(tema.value).toBe('clean');
  });

  it('"trocar o tipo" volta ao passo 1', async () => {
    const user = await irParaOPasso2();

    await user.click(screen.getByText(/trocar o tipo/));

    expect(screen.getByText('Qual é o seu negócio?')).toBeInTheDocument();
  });
});
