import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BusinessPage } from '@/lib/types';

// A API é mockada: este teste é sobre o que a pessoa vê e pode fazer na tela,
// não sobre a rede. O contrato de rede tem os testes do backend.
vi.mock('@/lib/api', () => ({
  getAvailability: vi.fn(),
  createBooking: vi.fn(),
  getMyAppointments: vi.fn(),
  cancelMyAppointment: vi.fn(),
}));

import { getAvailability, getMyAppointments } from '@/lib/api';
import { BookingFlow } from './BookingFlow';

const AMANHA = new Date(Date.now() + 24 * 60 * 60 * 1000);

const PAGINA: BusinessPage = {
  business: {
    id: 'b1',
    name: 'Barbearia do Zé',
    slug: 'barbearia-do-ze',
    timezone: 'America/Sao_Paulo',
    maxAdvanceDays: 60,
    address: 'Rua X, 10',
    phone: '5511999990000',
    serviceMode: 'PRESENCIAL',
    meetingUrl: null,
    closedWeekdays: [],
    logoUrl: null,
    coverUrl: null,
    accentColor: null,
    about: null,
    instagramUrl: null,
    themePreset: null,
  },
  services: [
    { id: 's1', name: 'Barba', durationMinutes: 20, priceCents: 2500 },
    { id: 's2', name: 'Corte', durationMinutes: 30, priceCents: 4000 },
  ],
  professionals: [{ id: 'p1', name: 'João', photoUrl: null, serviceIds: ['s1', 's2'] }],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(getAvailability).mockResolvedValue([
    {
      professionalId: 'p1',
      professionalName: 'João',
      slots: [{ startAt: AMANHA.toISOString(), label: '09:00' }],
    },
  ]);
});
afterEach(() => vi.clearAllMocks());

describe('formulário de dados do cliente', () => {
  it('marca nome e WhatsApp como obrigatórios, e não marca os opcionais', async () => {
    const user = userEvent.setup();
    render(<BookingFlow slug="barbearia-do-ze" data={PAGINA} />);

    await user.click(screen.getByText('Barba'));
    await user.click(await screen.findByRole('button', { name: '09:00' }));

    // O atributo é o que o navegador e o leitor de tela usam. Testar só o
    // asterisco pintado deixaria passar um asterisco decorativo sobre um campo
    // que o formulário aceita vazio.
    expect(screen.getByPlaceholderText('Seu nome')).toBeRequired();
    expect(screen.getByPlaceholderText('(11) 99999-9999')).toBeRequired();

    expect(screen.getByPlaceholderText('voce@email.com')).not.toBeRequired();
    expect(
      screen.getByPlaceholderText('Algo que o profissional precise saber?'),
    ).not.toBeRequired();
  });

  it('mostra o asterisco só nos dois campos obrigatórios', async () => {
    const user = userEvent.setup();
    render(<BookingFlow slug="barbearia-do-ze" data={PAGINA} />);
    await user.click(screen.getByText('Barba'));
    await user.click(await screen.findByRole('button', { name: '09:00' }));

    const rotulaNome = screen.getByPlaceholderText('Seu nome').closest('label')!;
    const rotulaEmail = screen
      .getByPlaceholderText('voce@email.com')
      .closest('label')!;

    expect(rotulaNome.textContent).toContain('*');
    expect(rotulaEmail.textContent).not.toContain('*');
  });
});

describe('meus agendamentos', () => {
  it('sem token guardado, explica de onde vêm os horários em vez de pedir telefone', async () => {
    // É a mudança de hoje: antes esta tela tinha um campo de telefone, e
    // digitar o número de qualquer pessoa mostrava a agenda dela. Se o campo
    // voltar, este teste quebra.
    const user = userEvent.setup();
    render(<BookingFlow slug="barbearia-do-ze" data={PAGINA} />);

    await user.click(screen.getByRole('button', { name: 'Meus agendamentos' }));

    expect(await screen.findByText(/Seus horários aparecem aqui/i)).toBeInTheDocument();

    // Sem CAMPO NENHUM, e não "sem o campo com aquele placeholder": checar o
    // placeholder deixaria o defeito voltar disfarçado de "Digite seu número".
    // A tela sem acesso não pode ter onde digitar — é isso que a fecha.
    expect(document.querySelectorAll('input, textarea')).toHaveLength(0);

    // E não pode nem tentar buscar: sem token não há o que perguntar à API.
    expect(getMyAppointments).not.toHaveBeenCalled();
  });

  it('com token guardado, busca e lista os horários', async () => {
    window.localStorage.setItem('agendai:acesso:barbearia-do-ze', 'tok-valido');
    vi.mocked(getMyAppointments).mockResolvedValue([
      {
        id: 'a1',
        service: 'Barba',
        professional: 'João',
        startAt: AMANHA.toISOString(),
        status: 'CONFIRMED',
      },
    ]);

    const user = userEvent.setup();
    render(<BookingFlow slug="barbearia-do-ze" data={PAGINA} />);
    await user.click(screen.getByRole('button', { name: 'Meus agendamentos' }));

    expect(await screen.findByText('Barba')).toBeInTheDocument();
    expect(getMyAppointments).toHaveBeenCalledWith('barbearia-do-ze', 'tok-valido');
  });
});
