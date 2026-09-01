import { describe, it, expect } from 'vitest';
import { rotuloDeDataHora, diaNoFuso, horaNoFuso, intervaloDoBloqueio } from './fuso';

// ---------------------------------------------------------------------------
// Fuso do negócio. É a classe de erro mais silenciosa do produto: não quebra
// tela, não gera exceção, não aparece em log — só faz o cliente ler um horário
// e o dono ler outro, e a conta fecha quando alguém falta ao atendimento.
//
// NOTA DE MÉTODO: a máquina que roda estes testes está em America/Sao_Paulo.
// Por isso quase tudo aqui usa Manaus (UTC-4) ou Nova York — testar com São
// Paulo daria verde mesmo se o código ignorasse o fuso do negócio e usasse o da
// máquina, que é exatamente o defeito que se quer barrar.
// ---------------------------------------------------------------------------

// 21:00 de 1º de setembro em São Paulo. Em UTC já é o DIA SEGUINTE.
const NOITE = '2026-09-02T00:00:00Z';

describe('diaNoFuso', () => {
  it('atendimento da noite NÃO vaza para o dia seguinte', () => {
    // O erro clássico: agrupar a agenda por dia em UTC. Funciona o dia inteiro
    // e erra à noite — o atendimento das 21:00 aparece na coluna de amanhã.
    expect(diaNoFuso(NOITE, 'America/Sao_Paulo')).toBe('2026-09-01');
    expect(diaNoFuso(NOITE, 'UTC')).toBe('2026-09-02');
  });

  it('o fuso do NEGÓCIO manda, não o da máquina', () => {
    // Manaus é UTC-4; a máquina do teste está em UTC-3. Se o código usasse o
    // fuso da máquina, os dois casos abaixo dariam a mesma hora.
    expect(horaNoFuso(NOITE, 'America/Manaus')).toBe('20:00');
    expect(horaNoFuso(NOITE, 'America/Sao_Paulo')).toBe('21:00');
  });

  it('fuso inválido devolve vazio em vez de data errada', () => {
    // Melhor a tela ficar sem o rótulo do que mostrar uma hora que não existe.
    expect(diaNoFuso(NOITE, 'Lixo/Nao_Existe')).toBe('');
    expect(horaNoFuso('nao-e-data', 'America/Sao_Paulo')).toBe('');
  });
});

describe('rotuloDeDataHora', () => {
  it('escreve em português, no fuso do negócio', () => {
    expect(rotuloDeDataHora(NOITE, 'America/Sao_Paulo')).toBe('ter, 1 de set às 21:00');
  });

  it('o MESMO instante muda de rótulo conforme o negócio', () => {
    // Um negócio em Manaus e outro em São Paulo mostram horas diferentes para o
    // mesmo agendamento — e os dois estão certos.
    expect(rotuloDeDataHora(NOITE, 'America/Manaus')).toBe('ter, 1 de set às 20:00');
    // Em UTC vira quarta, dia 2. É o que apareceria se ninguém passasse o fuso.
    expect(rotuloDeDataHora(NOITE, 'UTC')).toBe('qua, 2 de set às 00:00');
  });

  it('domingo aparece como "dom" (o índice 7 do Luxon precisa virar 0)', () => {
    // weekday do Luxon é 1=segunda … 7=domingo. Sem o `% 7` o domingo cairia
    // fora do vetor e o rótulo sairia "undefined".
    const domingo = '2026-09-06T15:00:00Z'; // domingo, 12:00 em São Paulo
    expect(rotuloDeDataHora(domingo, 'America/Sao_Paulo')).toBe('dom, 6 de set às 12:00');
  });

  it('data inválida não escreve "NaN" na tela', () => {
    expect(rotuloDeDataHora('qualquer coisa', 'America/Sao_Paulo')).toBe('');
  });
});

describe('intervaloDoBloqueio — caminho de ESCRITA', () => {
  it('grava o horário digitado no fuso do negócio', () => {
    // Errar aqui é pior que errar num rótulo: o bloqueio entra na hora errada e
    // libera para agendamento justamente quando o dono não vai estar.
    const r = intervaloDoBloqueio('2026-09-01', '09:00', '12:00', 'America/Sao_Paulo');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.startAt).toBe('2026-09-01T09:00:00.000-03:00');
    expect(r.endAt).toBe('2026-09-01T12:00:00.000-03:00');
  });

  it('respeita o horário de verão de quem tem', () => {
    // Prova que é conversão de fuso de verdade, e não um deslocamento fixo:
    // Nova York é -04:00 em setembro e -05:00 em janeiro. Um offset chumbado
    // acertaria um dos dois e erraria o outro por uma hora.
    const verao = intervaloDoBloqueio('2026-09-01', '09:00', '10:00', 'America/New_York');
    const inverno = intervaloDoBloqueio('2026-01-15', '09:00', '10:00', 'America/New_York');
    expect(verao.ok && verao.startAt).toBe('2026-09-01T09:00:00.000-04:00');
    expect(inverno.ok && inverno.startAt).toBe('2026-01-15T09:00:00.000-05:00');
  });

  it('recusa fim antes do início', () => {
    const r = intervaloDoBloqueio('2026-09-01', '12:00', '09:00', 'America/Sao_Paulo');
    expect(r).toEqual({ ok: false, erro: 'O fim precisa ser depois do início.' });
  });

  it('recusa início igual ao fim (bloqueio de duração zero não bloqueia nada)', () => {
    const r = intervaloDoBloqueio('2026-09-01', '09:00', '09:00', 'America/Sao_Paulo');
    expect(r.ok).toBe(false);
  });

  it('recusa data ou hora impossível', () => {
    for (const [data, ini, fim] of [
      ['2026-13-01', '09:00', '10:00'],
      ['2026-09-01', '25:00', '26:00'],
      ['', '09:00', '10:00'],
    ]) {
      const r = intervaloDoBloqueio(data, ini, fim, 'America/Sao_Paulo');
      expect(r, `${data} ${ini}-${fim}`).toEqual({ ok: false, erro: 'Data/horário inválidos.' });
    }
  });

  it('fuso inválido não grava bloqueio', () => {
    const r = intervaloDoBloqueio('2026-09-01', '09:00', '10:00', 'Lixo/Nao_Existe');
    expect(r.ok).toBe(false);
  });
});
