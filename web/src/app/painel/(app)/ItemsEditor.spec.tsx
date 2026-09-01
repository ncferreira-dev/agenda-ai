import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Appointment } from '@/lib/panel-api';

// A server action não roda em teste de componente: o que se verifica aqui é a
// trava da tela, que é a primeira barreira do dono contra reescrever dinheiro.
vi.mock('../actions', () => ({
  saveAppointmentItems: vi.fn(),
}));


import { ItemsEditor } from './ItemsEditor';

const atendimento = (over: Partial<Appointment> = {}): Appointment =>
  ({
    id: 'a1',
    startAt: '2026-09-01T12:00:00.000Z',
    endAt: '2026-09-01T12:30:00.000Z',
    status: 'COMPLETED',
    paid: false,
    confirmedByCustomer: true,
    service: 'Corte',
    totalCents: 4000,
    items: [{ id: 'i1', name: 'Corte', priceCents: 4000 }],
    professional: 'João',
    professionalPhone: null,
    professionalHasEmail: false,
    customer: { name: 'Maria', phone: '5511999998888' },
    ...over,
  }) as Appointment;

describe('atendimento já pago', () => {
  it('trava os itens e diz por quê', () => {
    // Editar item de atendimento pago é reescrever histórico financeiro. O
    // backend também recusa (400 "Agendamento já pago"), mas a tela não deve
    // nem oferecer — deixar o botão ali só produz um erro que o dono não
    // entende depois de já ter digitado.
    render(<ItemsEditor appointment={atendimento({ paid: true, totalCents: 4000 })} />);

    expect(screen.getByText(/itens travados \(pago\)/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
    expect(document.querySelectorAll('input')).toHaveLength(0);
  });
});

describe('atendimento não pago', () => {
  it('oferece a edição e mostra o total atual', () => {
    render(<ItemsEditor appointment={atendimento({ paid: false, totalCents: 4000 })} />);

    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument();
    expect(screen.getByText(/R\$/)).toBeInTheDocument();
    expect(screen.queryByText(/travados/i)).not.toBeInTheDocument();
  });

  it('ao abrir o editor, o total acompanha o que foi digitado', async () => {
    const user = userEvent.setup();
    render(
      <ItemsEditor
        appointment={atendimento({
          paid: false,
          totalCents: 4000,
          items: [{ id: 'i1', name: 'Corte', priceCents: 4000 }],
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /editar/i }));

    const precos = screen.getAllByDisplayValue('40.00');
    await user.clear(precos[0]);
    await user.type(precos[0], '55,50');

    // O total precisa refletir o digitado ANTES de salvar — é o que o dono usa
    // pra conferir se cobrou certo.
    expect(await screen.findByText(/55,50/)).toBeInTheDocument();
  });
});
