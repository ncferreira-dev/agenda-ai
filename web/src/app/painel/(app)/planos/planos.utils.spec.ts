import { describe, it, expect } from 'vitest';
import { statusBanner, type EstadoDaAssinatura } from './planos.utils';

// ---------------------------------------------------------------------------
// O banner de assinatura. É a frase que decide se o dono acha que precisa fazer
// alguma coisa hoje — e a PRECEDÊNCIA entre os estados é o que mais tem chance
// de ser invertido numa edição distraída.
// ---------------------------------------------------------------------------

const HOJE = new Date('2026-08-31T12:00:00.000Z');
const emDias = (n: number) => new Date(HOJE.getTime() + n * 24 * 60 * 60 * 1000).toISOString();

const estado = (over: Partial<EstadoDaAssinatura> = {}): EstadoDaAssinatura => ({
  subscriptionStatus: 'TRIALING',
  plan: null,
  trialEndsAt: null,
  ...over,
});

describe('assinatura resolvida', () => {
  it('ativa mostra o nome do plano', () => {
    const b = statusBanner(estado({ subscriptionStatus: 'ACTIVE', plan: 'PRO' }), HOJE);
    expect(b).toEqual({ tone: 'ok', title: 'Plano atual: Pro', hint: 'Assinatura ativa.' });
  });

  it('ativa SEM plano gravado não mente: cai no teste grátis', () => {
    // Estado inconsistente que já apareceu em produção. Dizer "Plano atual:
    // null" seria pior do que tratar como quem ainda não escolheu.
    const b = statusBanner(estado({ subscriptionStatus: 'ACTIVE', plan: null }), HOJE);
    expect(b.title).toBe('Teste grátis');
  });
});

describe('precedência entre estados', () => {
  it('pagamento pendente vence o teste grátis que ainda não venceu', () => {
    // Este é o inverso perigoso: um dono com pagamento pendente NÃO pode ver
    // "teste grátis (faltam 10 dias)" só porque a data ainda está no banco.
    const b = statusBanner(
      estado({ subscriptionStatus: 'PAST_DUE', trialEndsAt: emDias(10) }),
      HOJE,
    );
    expect(b.tone).toBe('warn');
    expect(b.title).toBe('Pagamento pendente');
  });

  it('cancelada vence o teste grátis', () => {
    const b = statusBanner(
      estado({ subscriptionStatus: 'CANCELED', trialEndsAt: emDias(10) }),
      HOJE,
    );
    expect(b.title).toBe('Assinatura cancelada');
  });

  it('ativa vence pendente quando os dois poderiam casar', () => {
    const b = statusBanner(
      estado({ subscriptionStatus: 'ACTIVE', plan: 'ULTRA', trialEndsAt: emDias(3) }),
      HOJE,
    );
    expect(b.title).toBe('Plano atual: Ultra');
  });
});

describe('contagem do teste grátis', () => {
  it('conta os dias que faltam', () => {
    expect(statusBanner(estado({ trialEndsAt: emDias(10) }), HOJE).title).toBe(
      'Teste grátis (faltam 10 dias)',
    );
  });

  it('singular no último dia', () => {
    // "faltam 1 dias" é o erro de plural que passa despercebido por meses.
    expect(statusBanner(estado({ trialEndsAt: emDias(0.5) }), HOJE).title).toBe(
      'Teste grátis (faltam 1 dia)',
    );
  });

  it('vencido avisa que acabou, e em tom de alerta', () => {
    const b = statusBanner(estado({ trialEndsAt: emDias(-1) }), HOJE);
    expect(b.tone).toBe('warn');
    expect(b.title).toBe('Seu teste grátis terminou');
  });

  it('exatamente no instante do vencimento já conta como terminado', () => {
    const b = statusBanner(estado({ trialEndsAt: HOJE.toISOString() }), HOJE);
    expect(b.title).toBe('Seu teste grátis terminou');
  });

  it('sem data de teste não inventa contagem', () => {
    const b = statusBanner(estado({ trialEndsAt: null }), HOJE);
    expect(b).toEqual({ tone: 'ok', title: 'Teste grátis', hint: 'Escolha um plano quando quiser.' });
  });
});
