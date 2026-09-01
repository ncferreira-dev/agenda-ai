import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkingHour } from '@/lib/panel-api';

vi.mock('../../actions', () => ({ saveWorkingHours: vi.fn() }));

import { HoursEditor } from './HoursEditor';

const faixa = (weekday: number, startMinute: number, endMinute: number) =>
  ({ weekday, startMinute, endMinute }) as WorkingHour;

/** O hidden `faixas` é o que de fato vai pro servidor — é ele que se verifica. */
function oQueVaiSerSalvo() {
  const input = document.querySelector('input[name="faixas"]') as HTMLInputElement;
  return JSON.parse(input.value) as { weekday: number; startMinute: number; endMinute: number }[];
}

function linhaDoDia(nome: string) {
  return screen.getByText(nome).parentElement as HTMLElement;
}

describe('grade que veio do banco', () => {
  it('mostra as faixas existentes já convertidas em horário', () => {
    render(<HoursEditor professionalId="p1" initial={[faixa(1, 540, 720)]} onClose={() => {}} />);
    expect(screen.getByDisplayValue('09:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('12:00')).toBeInTheDocument();
  });

  it('dia sem faixa aparece como "Fechado"', () => {
    // O dono precisa VER que o domingo existe e está fechado. Sumir com a linha
    // faria parecer que o dia não é configurável.
    render(<HoursEditor professionalId="p1" initial={[faixa(1, 540, 720)]} onClose={() => {}} />);
    expect(screen.getAllByText('Fechado')).toHaveLength(6);
  });

  it('lista de segunda a domingo, com o domingo por último', () => {
    // weekday 0 é domingo no banco, mas ninguém lê a semana começando por ele.
    render(<HoursEditor professionalId="p1" initial={[]} onClose={() => {}} />);
    const nomes = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    const posicoes = nomes.map((n) => screen.getByText(n).compareDocumentPosition(screen.getByText('Domingo')));
    // Todos vêm ANTES do domingo (4 = DOCUMENT_POSITION_FOLLOWING), menos ele mesmo.
    expect(posicoes.slice(0, 6).every((p) => p & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('duas faixas no mesmo dia sobrevivem (manhã e tarde, com almoço no meio)', () => {
    render(
      <HoursEditor professionalId="p1" initial={[faixa(2, 540, 720), faixa(2, 780, 1080)]} onClose={() => {}} />,
    );
    expect(oQueVaiSerSalvo()).toEqual([
      { weekday: 2, startMinute: 540, endMinute: 720 },
      { weekday: 2, startMinute: 780, endMinute: 1080 },
    ]);
  });
});

describe('editando a grade', () => {
  it('"+ faixa" abre uma faixa padrão de 09:00 às 12:00', async () => {
    const user = userEvent.setup();
    render(<HoursEditor professionalId="p1" initial={[]} onClose={() => {}} />);

    await user.click(within(linhaDoDia('Segunda')).getByText('+ faixa'));

    expect(oQueVaiSerSalvo()).toEqual([{ weekday: 1, startMinute: 540, endMinute: 720 }]);
  });

  it('remover a faixa fecha o dia', async () => {
    const user = userEvent.setup();
    render(<HoursEditor professionalId="p1" initial={[faixa(1, 540, 720)]} onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'remover faixa' }));

    expect(oQueVaiSerSalvo()).toEqual([]);
    expect(screen.getAllByText('Fechado')).toHaveLength(7);
  });

  it('trocar o horário na tela muda o que vai ser salvo', async () => {
    const user = userEvent.setup();
    render(<HoursEditor professionalId="p1" initial={[faixa(1, 540, 720)]} onClose={() => {}} />);

    await user.clear(screen.getByDisplayValue('12:00'));
    await user.type(screen.getByDisplayValue(''), '18:00');

    expect(oQueVaiSerSalvo()).toEqual([{ weekday: 1, startMinute: 540, endMinute: 1080 }]);
  });

  it('manda o profissional junto, senão a grade não sabe de quem é', () => {
    render(<HoursEditor professionalId="p-99" initial={[]} onClose={() => {}} />);
    const id = document.querySelector('input[name="professionalId"]') as HTMLInputElement;
    expect(id.value).toBe('p-99');
  });
});
