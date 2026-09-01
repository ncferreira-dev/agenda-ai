import { describe, it, expect } from 'vitest';
import type { WorkingHour } from '@/lib/panel-api';
import {
  paraHHmm, paraMinutos, agrupaPorDia, faixasParaSalvar, iniciaisDoProfissional,
  problemasDaGrade,
} from './horas.utils';

// ---------------------------------------------------------------------------
// Grade semanal do profissional. É a matéria-prima da agenda: o motor de
// horários só oferece slot dentro destas faixas. Minuto errado aqui não aparece
// na tela do dono — aparece como horário que o cliente não consegue marcar, ou
// como horário oferecido quando o profissional não está.
// ---------------------------------------------------------------------------

const faixa = (weekday: number, startMinute: number, endMinute: number) =>
  ({ weekday, startMinute, endMinute }) as WorkingHour;

describe('conversão minuto ↔ HH:mm', () => {
  it('vai e volta sem perder nada', () => {
    for (const min of [0, 1, 59, 60, 540, 719, 720, 1439, 1440]) {
      expect(paraMinutos(paraHHmm(min)), String(min)).toBe(min);
    }
  });

  it('formata com dois dígitos dos dois lados', () => {
    expect(paraHHmm(540)).toBe('09:00');
    expect(paraHHmm(9)).toBe('00:09');
    expect(paraHHmm(0)).toBe('00:00');
  });

  it('meia-noite do fim do dia é 24:00, e não 00:00', () => {
    // 1440 é o fim do dia. Virar "00:00" faria a faixa 09:00–24:00 ser lida
    // como 09:00–00:00, que o backend recusa (início >= fim).
    expect(paraHHmm(1440)).toBe('24:00');
    expect(paraMinutos('24:00')).toBe(1440);
  });

  it('campo vazio ou torto vira 0, nunca NaN', () => {
    // NaN vai pro JSON como null e derruba a grade inteira no backend.
    for (const lixo of ['', 'abc', ':', '09:']) {
      expect(Number.isNaN(paraMinutos(lixo)), lixo).toBe(false);
    }
    expect(paraMinutos('')).toBe(0);
  });
});

describe('agrupaPorDia', () => {
  it('todo dia da semana existe, mesmo vazio', () => {
    // É o que faz o editor escrever "Fechado" em vez de sumir com a linha do
    // dia — o dono precisa ver que domingo existe e está fechado.
    const grade = agrupaPorDia([]);
    expect(Object.keys(grade).map(Number).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(grade[0]).toEqual([]);
  });

  it('converte os minutos do banco em horários da tela', () => {
    const grade = agrupaPorDia([faixa(1, 540, 720)]);
    expect(grade[1]).toEqual([{ start: '09:00', end: '12:00' }]);
  });

  it('duas faixas no mesmo dia (manhã e tarde) ficam juntas', () => {
    // O caso real: almoço no meio. Perder a segunda faixa fecharia a tarde.
    const grade = agrupaPorDia([faixa(2, 540, 720), faixa(2, 780, 1080)]);
    expect(grade[2]).toEqual([
      { start: '09:00', end: '12:00' },
      { start: '13:00', end: '18:00' },
    ]);
  });

  it('domingo é o dia 0, e não o 7', () => {
    const grade = agrupaPorDia([faixa(0, 600, 840)]);
    expect(grade[0]).toHaveLength(1);
    expect(grade[6]).toEqual([]);
  });
});

describe('faixasParaSalvar', () => {
  it('devolve o que o servidor espera', () => {
    const grade = agrupaPorDia([faixa(1, 540, 720)]);
    expect(faixasParaSalvar(grade)).toEqual([{ weekday: 1, startMinute: 540, endMinute: 720 }]);
  });

  it('descarta faixa pela metade', () => {
    // O editor cria a linha ANTES de a pessoa preencher. Mandar incompleta
    // faria o backend recusar a grade inteira por causa de uma linha que a
    // pessoa nem terminou de digitar.
    const grade = { ...agrupaPorDia([]), 1: [{ start: '09:00', end: '' }, { start: '', end: '18:00' }] };
    expect(faixasParaSalvar(grade)).toEqual([]);
  });

  it('a grade da semana inteira sobrevive à ida e volta', () => {
    const doBanco = [faixa(1, 540, 720), faixa(1, 780, 1080), faixa(6, 600, 840)];
    const devolta = faixasParaSalvar(agrupaPorDia(doBanco));
    expect(devolta).toHaveLength(3);
    expect(devolta).toEqual(expect.arrayContaining(doBanco.map((f) => ({ ...f }))));
  });

  it('grade vazia manda lista vazia (é como se fecha a semana toda)', () => {
    expect(faixasParaSalvar(agrupaPorDia([]))).toEqual([]);
  });
});

describe('problemasDaGrade', () => {
  const grade = (faixas: Record<number, Array<{ start: string; end: string }>>) => ({
    0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
    ...faixas,
  });

  it('faixa normal não é problema', () => {
    expect(problemasDaGrade(grade({ 1: [{ start: '09:00', end: '18:00' }] }))).toEqual([]);
  });

  it('fim antes do início é apontado, com o dia e a posição', () => {
    const p = problemasDaGrade(grade({ 3: [{ start: '18:00', end: '09:00' }] }));
    expect(p).toHaveLength(1);
    expect(p[0].weekday).toBe(3);
    expect(p[0].indice).toBe(0);
    expect(p[0].mensagem).toMatch(/depois do início/i);
  });

  it('fim IGUAL ao início também é problema (faixa de zero minuto não oferece horário)', () => {
    // O backend recusa com início < fim, não <=. Uma faixa de duração zero
    // passaria na tela e voltaria como erro genérico.
    expect(problemasDaGrade(grade({ 5: [{ start: '14:00', end: '14:00' }] }))).toHaveLength(1);
  });

  it('faixa pela metade NÃO é problema — ela nem vai ser enviada', () => {
    // faixasParaSalvar descarta faixa incompleta. Travar o salvamento por causa
    // dela seria barrar uma linha que a pessoa acabou de criar e não preencheu.
    const meia = grade({ 2: [{ start: '09:00', end: '' }, { start: '', end: '18:00' }] });
    expect(problemasDaGrade(meia)).toEqual([]);
  });

  it('acha o problema mesmo com faixas boas antes e depois, no mesmo dia', () => {
    const p = problemasDaGrade(
      grade({
        4: [
          { start: '09:00', end: '12:00' },
          { start: '18:00', end: '13:00' },
          { start: '19:00', end: '20:00' },
        ],
      }),
    );
    expect(p).toHaveLength(1);
    expect(p[0].indice).toBe(1);
  });

  it('aponta todos os dias com problema, não só o primeiro', () => {
    const p = problemasDaGrade(
      grade({ 1: [{ start: '18:00', end: '09:00' }], 6: [{ start: '20:00', end: '08:00' }] }),
    );
    expect(p.map((x) => x.weekday).sort()).toEqual([1, 6]);
  });
});

describe('iniciaisDoProfissional', () => {
  it('duas primeiras iniciais, em maiúsculas', () => {
    expect(iniciaisDoProfissional('joão silva')).toBe('JS');
    expect(iniciaisDoProfissional('  Maria   Aparecida Souza ')).toBe('MA');
  });

  it('um nome só, e nome vazio, não quebram', () => {
    expect(iniciaisDoProfissional('João')).toBe('J');
    expect(iniciaisDoProfissional('')).toBe('');
  });
});
