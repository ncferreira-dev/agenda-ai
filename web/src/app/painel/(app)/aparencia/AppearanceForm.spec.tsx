import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Me } from '@/lib/panel-api';

vi.mock('../../actions', () => ({ saveAppearance: vi.fn() }));

// O estado da action é mockado localmente (e não pelo vitest.setup) porque
// AQUI ele importa: a tela precisa mostrar o erro que o servidor devolveu, e
// com o mock global — que sempre devolve o estado inicial — esse caminho nunca
// seria exercido.
let estado: { ok: boolean; error?: string } = { ok: false };
vi.mock('react-dom', async (original) => {
  const real = await original<typeof import('react-dom')>();
  return {
    ...real,
    useFormState: () => [estado, vi.fn()],
    useFormStatus: () => ({ pending: false }),
  };
});

import { AppearanceForm } from './AppearanceForm';

// ---------------------------------------------------------------------------
// TELA DE APARÊNCIA.
//
// Quase tudo aqui é botão que não é campo: os presets de cor e os cards de
// estilo são <button type="button">, e o que de fato viaja pro servidor são
// dois <input type="hidden">. Ou seja, o que a tela MOSTRA e o que ela ENVIA
// são coisas separadas — dá pra ver a cor certa marcada e mandar outra.
// Por isso todo teste daqui confere o hidden, não o destaque visual.
//
// O caso mais fácil de errar é "Usar cor padrão": ele precisa enviar VAZIO
// (é assim que o backend volta pro padrão). Se enviasse o hex que está no
// preview, o dono ficaria preso na cor padrão gravada como escolha explícita.
// ---------------------------------------------------------------------------

const PADRAO = '#2563EB';

function negocio(over: Partial<Me['business']> = {}): Me['business'] {
  return {
    id: 'b1',
    name: 'Studio da Maria',
    slug: 'studio-da-maria',
    timezone: 'America/Sao_Paulo',
    phone: null,
    address: null,
    serviceMode: 'PRESENCIAL',
    meetingUrl: null,
    slotStepMinutes: 15,
    minLeadMinutes: 60,
    maxAdvanceDays: 60,
    reminderHoursBefore: 24,
    logoUrl: null,
    coverUrl: null,
    accentColor: null,
    about: null,
    instagramUrl: null,
    profession: null,
    themePreset: null,
    onboardedAt: null,
    inactiveDays: 60,
    vipMinSpentCents: null,
    recurringMinVisits: 3,
    notifyWhatsApp: true,
    notifyEmail: false,
    notifyPush: false,
    notifyOwnerAllBookings: true,
    notifyDailySummary: false,
    ownerWhatsApp: null,
    ownerEmail: null,
    plan: null,
    subscriptionStatus: 'TRIALING',
    trialEndsAt: null,
    ...over,
  };
}

/** O valor que de fato vai pro servidor — não o que está destacado na tela. */
const enviado = (campo: string) =>
  (document.querySelector(`input[name="${campo}"]`) as HTMLInputElement | null)?.value;

beforeEach(() => {
  estado = { ok: false };
});

describe('aparência: cor da marca', () => {
  it('negócio sem cor escolhida envia vazio e mostra o padrão no preview', () => {
    render(<AppearanceForm business={negocio()} />);

    expect(enviado('accentColor')).toBe('');
    const preview = document.querySelector('[style*="--accent"]') as HTMLElement;
    expect(preview.style.getPropertyValue('--accent')).toBe(PADRAO);
  });

  it('clicar num preset é o que muda o valor enviado', async () => {
    const user = userEvent.setup();
    render(<AppearanceForm business={negocio()} />);

    await user.click(screen.getByRole('button', { name: '#0F766E' }));
    expect(enviado('accentColor')).toBe('#0F766E');
  });

  it('a cor já salva vem marcada, mesmo gravada em minúsculas', () => {
    render(<AppearanceForm business={negocio({ accentColor: '#7c3aed' })} />);

    // O banco guarda em maiúsculas, mas a comparação da tela é case-insensitive
    // de propósito — uma cor salva antes dessa regra não pode aparecer como
    // "nenhuma escolhida" e sumir no primeiro salvamento.
    const preset = screen.getByRole('button', { name: '#7C3AED' });
    expect(preset.className).toMatch(/swatchActive/);
    expect(enviado('accentColor')).toBe('#7c3aed');
  });

  it('"Usar cor padrão" envia VAZIO (e não o hex que aparece no preview)', async () => {
    const user = userEvent.setup();
    render(<AppearanceForm business={negocio({ accentColor: '#C2410C' })} />);
    expect(enviado('accentColor')).toBe('#C2410C');

    await user.click(screen.getByRole('button', { name: 'Usar cor padrão' }));

    expect(enviado('accentColor')).toBe('');
    const preview = document.querySelector('[style*="--accent"]') as HTMLElement;
    expect(preview.style.getPropertyValue('--accent')).toBe(PADRAO);
  });
});

describe('aparência: estilo da página', () => {
  it('negócio sem estilo salvo cai em "clean"', () => {
    render(<AppearanceForm business={negocio()} />);
    expect(enviado('themePreset')).toBe('clean');
  });

  it('o estilo salvo vem selecionado e trocar muda o que é enviado', async () => {
    const user = userEvent.setup();
    render(<AppearanceForm business={negocio({ themePreset: 'bold' })} />);
    expect(enviado('themePreset')).toBe('bold');

    await user.click(screen.getByRole('button', { name: /Suave/ }));
    expect(enviado('themePreset')).toBe('suave');
  });

  it('os três estilos aparecem com nome e explicação', () => {
    render(<AppearanceForm business={negocio()} />);
    for (const nome of ['Clean', 'Bold', 'Suave']) {
      expect(screen.getByRole('button', { name: new RegExp(nome) })).toBeInTheDocument();
    }
    expect(screen.getByText(/Contraste forte/)).toBeInTheDocument();
  });
});

describe('aparência: imagens', () => {
  it('sem logo e sem capa salvas, não há miniatura — só os campos de envio', () => {
    render(<AppearanceForm business={negocio()} />);

    expect(screen.queryByAltText('logo atual')).not.toBeInTheDocument();
    expect(screen.queryByAltText('capa atual')).not.toBeInTheDocument();
    expect(document.querySelector('input[name="logo"]')).toBeInTheDocument();
    expect(document.querySelector('input[name="cover"]')).toBeInTheDocument();
  });

  it('com imagens salvas, a miniatura mostra a que está no ar', () => {
    render(
      <AppearanceForm
        business={negocio({ logoUrl: 'https://cdn/logo.png', coverUrl: 'https://cdn/capa.jpg' })}
      />,
    );

    expect(screen.getByAltText('logo atual')).toHaveAttribute('src', 'https://cdn/logo.png');
    expect(screen.getByAltText('capa atual')).toHaveAttribute('src', 'https://cdn/capa.jpg');
  });

  it('os campos de arquivo aceitam só imagem e não são obrigatórios', () => {
    render(<AppearanceForm business={negocio()} />);

    for (const campo of ['logo', 'cover']) {
      const input = document.querySelector(`input[name="${campo}"]`) as HTMLInputElement;
      expect(input.type).toBe('file');
      // Sem isto, o seletor do celular oferece PDF e vídeo — que o backend
      // recusa depois do upload inteiro subir.
      expect(input.accept).toBe('image/*');
      // Salvar só o texto, sem trocar a imagem, tem que continuar possível.
      expect(input).not.toBeRequired();
    }
  });
});

describe('aparência: textos e resposta do servidor', () => {
  it('sobre e instagram vêm preenchidos com o que está salvo', () => {
    render(
      <AppearanceForm
        business={negocio({ about: 'Corte com hora marcada', instagramUrl: 'https://instagram.com/eu' })}
      />,
    );

    expect(screen.getByDisplayValue('Corte com hora marcada')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://instagram.com/eu')).toBeInTheDocument();
  });

  it('o "Sobre" trava em 800 caracteres — o mesmo limite que o backend recusa', () => {
    render(<AppearanceForm business={negocio()} />);
    const sobre = document.querySelector('textarea[name="about"]') as HTMLTextAreaElement;
    expect(sobre.maxLength).toBe(800);
  });

  it('erro do servidor aparece na tela em vez de sumir', () => {
    estado = { ok: false, error: 'Falha ao enviar a imagem. Tente um arquivo menor.' };
    render(<AppearanceForm business={negocio()} />);

    expect(screen.getByText(/Falha ao enviar a imagem/)).toBeInTheDocument();
  });

  it('quando salva, mostra a confirmação', () => {
    estado = { ok: true };
    render(<AppearanceForm business={negocio()} />);

    expect(screen.getByText(/salvo/)).toBeInTheDocument();
  });
});
