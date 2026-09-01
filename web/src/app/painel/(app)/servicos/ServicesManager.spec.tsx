import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Service } from '@/lib/panel-api';

vi.mock('../../actions', () => ({
  createService: vi.fn(),
  updateService: vi.fn(),
  setServiceActive: vi.fn(),
}));

import { ServicesManager } from './ServicesManager';

const servico = (over: Partial<Service> = {}): Service => ({
  id: 's1',
  name: 'Corte',
  durationMinutes: 30,
  priceCents: 4000,
  active: true,
  followUpDays: null,
  followUpMessage: null,
  discountKind: null,
  discountValue: 0,
  isKit: false,
  kitItems: [],
  ...over,
});

const CORTE = servico({ id: 'c', name: 'Corte' });
const BARBA = servico({ id: 'b', name: 'Barba', priceCents: 2500, durationMinutes: 20 });
const KIT = servico({
  id: 'k',
  name: 'Corte + Barba',
  isKit: true,
  priceCents: 6000,
  durationMinutes: 50,
  kitItems: [
    { memberServiceId: 'c', member: { name: 'Corte' } },
    { memberServiceId: 'b', member: { name: 'Barba' } },
  ] as Service['kitItems'],
});

/**
 * Abre a edição do serviço na posição `indice` e devolve o FORMULÁRIO DE EDIÇÃO.
 *
 * Escopar é obrigatório aqui: o formulário de "Novo serviço" fica sempre acima
 * da lista, então `document.querySelector('input[name=...]')` acha os campos
 * DELE primeiro. Foi assim que a primeira versão destes testes falhou lendo
 * preço vazio — estava lendo o formulário errado.
 *
 * Achar o formulário certo também tem pegadinha: CADA linha da lista tem um
 * <form> pequeno de "Desativar/Reativar" que TAMBÉM carrega um hidden `id`, e
 * ele vem antes no documento. Procurar só por `input[name="id"]` devolvia o
 * formulário de desativar da primeira linha. O de edição é o único que tem
 * `id` E `preco`.
 */
async function editar(indice: number) {
  const user = userEvent.setup();
  await user.click(screen.getAllByRole('button', { name: 'Editar' })[indice]);
  const form = [...document.querySelectorAll('form')].find(
    (f) => f.querySelector('input[name="id"]') && f.querySelector('input[name="preco"]'),
  ) as HTMLFormElement;
  return { user, form };
}

describe('lista de serviços', () => {
  it('sem serviço nenhum, convida a criar o primeiro', () => {
    render(<ServicesManager services={[]} />);
    expect(screen.getByText(/Nenhum serviço ainda/)).toBeInTheDocument();
  });

  it('marca o kit e mostra o que ele inclui', () => {
    render(<ServicesManager services={[CORTE, BARBA, KIT]} />);
    expect(screen.getByText('kit')).toBeInTheDocument();
    expect(screen.getByText(/inclui Corte \+ Barba/)).toBeInTheDocument();
  });

  it('serviço inativo aparece marcado, e o botão vira "Reativar"', () => {
    render(<ServicesManager services={[servico({ active: false })]} />);
    expect(screen.getByText('inativo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeInTheDocument();
    // O hidden manda o valor OPOSTO do atual — é o que o botão promete fazer.
    const alvo = document.querySelector('input[name="active"]') as HTMLInputElement;
    expect(alvo.value).toBe('true');
  });

  it('serviço ativo oferece desativar, mandando active=false', () => {
    render(<ServicesManager services={[servico({ active: true })]} />);
    expect(screen.getByRole('button', { name: 'Desativar' })).toBeInTheDocument();
    const alvo = document.querySelector('input[name="active"]') as HTMLInputElement;
    expect(alvo.value).toBe('false');
  });

  it('mostra o desconto do jeito certo pra cada tipo', () => {
    render(
      <ServicesManager
        services={[
          servico({ id: '1', name: 'Pct', discountKind: 'PERCENT', discountValue: 10 }),
          servico({ id: '2', name: 'Fixo', discountKind: 'FIXED', discountValue: 500 }),
        ]}
      />,
    );
    expect(screen.getByText('-10%')).toBeInTheDocument();
    // FIXED é guardado em CENTAVOS: 500 são cinco reais, não quinhentos.
    expect(screen.getByText('-R$ 5,00')).toBeInTheDocument();
  });
});

describe('editar um KIT', () => {
  it('não deixa desmarcar "é um kit", e explica o porquê', async () => {
    // DEFEITO REAL JÁ CORRIGIDO, e é o que este teste segura: desmarcar o
    // toggle não fazia nada (updateService nunca manda isKit) E ainda
    // descartava a composição, porque a action só reenvia os membros quando
    // isKit é true. O dono "editava" o kit e perdia os itens dele.
    render(<ServicesManager services={[CORTE, BARBA, KIT]} />);
    const { form } = await editar(2);

    expect(within(form).queryByText('Montar este serviço como um kit')).not.toBeInTheDocument();
    expect(within(form).getByText(/Para deixar de ser um kit, exclua e recrie/)).toBeInTheDocument();

    // O hidden garante que isKit=true vá no submit, pra composição ir junto.
    const isKit = form.querySelector('input[name="isKit"]') as HTMLInputElement;
    expect(isKit.type).toBe('hidden');
    expect(isKit.value).toBe('true');
  });

  it('não oferece campo de duração (ela é a soma dos membros)', async () => {
    render(<ServicesManager services={[CORTE, BARBA, KIT]} />);
    const { form } = await editar(2);

    expect(form.querySelector('input[name="durationMinutes"]')).toBeNull();
  });

  it('vem com os membros atuais já marcados', async () => {
    render(<ServicesManager services={[CORTE, BARBA, KIT]} />);
    const { form } = await editar(2);

    const membros = [...form.querySelectorAll('input[name="kitMemberIds"]')] as HTMLInputElement[];
    expect(membros.map((m) => m.value).sort()).toEqual(['b', 'c']);
    expect(membros.every((m) => m.checked)).toBe(true);
  });

  it('o próprio kit não aparece como candidato a membro de si mesmo', async () => {
    render(<ServicesManager services={[CORTE, BARBA, KIT]} />);
    const { form } = await editar(2);

    const membros = [...form.querySelectorAll('input[name="kitMemberIds"]')] as HTMLInputElement[];
    expect(membros.map((m) => m.value)).not.toContain('k');
  });
});

describe('editar um serviço comum', () => {
  it('oferece a duração, que ali é editável', async () => {
    render(<ServicesManager services={[CORTE]} />);
    const { form } = await editar(0);

    const duracao = form.querySelector('input[name="durationMinutes"]') as HTMLInputElement;
    expect(duracao).not.toBeNull();
    expect(duracao.defaultValue).toBe('30');
  });

  it('o preço chega em reais, não em centavos', async () => {
    render(<ServicesManager services={[CORTE]} />);
    const { form } = await editar(0);

    const preco = form.querySelector('input[name="preco"]') as HTMLInputElement;
    expect(preco.defaultValue).toBe('40,00');
  });
});
