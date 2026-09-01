'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveWorkingHours, type ActionState } from '../../actions';
import type { WorkingHour } from '@/lib/panel-api';
import {
  agrupaPorDia,
  faixasParaSalvar,
  problemasDaGrade,
  type Faixa,
  type GradePorDia,
} from './horas.utils';
import styles from '../../painel.module.css';

const INIT: ActionState = { ok: false };

// Ordem de exibição: segunda a domingo (weekday 0 = domingo).
const DIAS: { wd: number; nome: string }[] = [
  { wd: 1, nome: 'Segunda' },
  { wd: 2, nome: 'Terça' },
  { wd: 3, nome: 'Quarta' },
  { wd: 4, nome: 'Quinta' },
  { wd: 5, nome: 'Sexta' },
  { wd: 6, nome: 'Sábado' },
  { wd: 0, nome: 'Domingo' },
];

function Save({ bloqueado }: { bloqueado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={`${styles.smallBtn} ${styles.primarySmall}`}
      type="submit"
      disabled={pending || bloqueado}
    >
      {pending ? 'Salvando…' : 'Salvar grade'}
    </button>
  );
}

export function HoursEditor({
  professionalId,
  initial,
  onClose,
}: {
  professionalId: string;
  initial: WorkingHour[];
  onClose: () => void;
}) {
  const [state, action] = useFormState(saveWorkingHours, INIT);

  // Estado: faixas por dia, semeado a partir do que veio do banco.
  const [byDay, setByDay] = useState<GradePorDia>(() => agrupaPorDia(initial));

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  const faixas = useMemo(() => faixasParaSalvar(byDay), [byDay]);

  // O servidor recusa a grade INTEIRA por causa de uma faixa invertida, e com
  // uma mensagem que não diz qual é. Achamos aqui, antes de enviar, e apontamos
  // o dia — o servidor continua sendo o guarda de verdade.
  const problemas = useMemo(() => problemasDaGrade(byDay), [byDay]);
  const problemaEm = (wd: number, i: number) =>
    problemas.find((p) => p.weekday === wd && p.indice === i);
  const diasComProblema = DIAS.filter(({ wd }) => problemas.some((p) => p.weekday === wd)).map(
    ({ nome }) => nome,
  );

  function addRange(wd: number) {
    setByDay((p) => ({ ...p, [wd]: [...p[wd], { start: '09:00', end: '12:00' }] }));
  }
  function setRange(wd: number, i: number, field: keyof Faixa, value: string) {
    setByDay((p) => ({ ...p, [wd]: p[wd].map((r, j) => (j === i ? { ...r, [field]: value } : r)) }));
  }
  function removeRange(wd: number, i: number) {
    setByDay((p) => ({ ...p, [wd]: p[wd].filter((_, j) => j !== i) }));
  }

  return (
    <form action={action} className={styles.hoursModal}>
      <input type="hidden" name="professionalId" value={professionalId} />
      <input type="hidden" name="faixas" value={JSON.stringify(faixas)} />

      {state.error && <p className={styles.error}>{state.error}</p>}
      {diasComProblema.length > 0 && (
        <p className={styles.error} role="alert">
          {`Confira ${diasComProblema.join(', ')}: o fim de uma faixa está antes do início.`}
        </p>
      )}

      {DIAS.map(({ wd, nome }) => (
        <div key={wd} className={styles.weekday}>
          <div className={styles.weekdayName}>{nome}</div>
          <div className={styles.ranges}>
            {byDay[wd].length === 0 && <span className={styles.closed}>Fechado</span>}
            {byDay[wd].map((r, i) => {
              const problema = problemaEm(wd, i);
              return (
                <div key={i}>
                  <div className={styles.range}>
                    <input
                      className={styles.timeInput}
                      type="time"
                      value={r.start}
                      aria-invalid={problema ? true : undefined}
                      aria-label={`${nome}: início da faixa ${i + 1}`}
                      onChange={(e) => setRange(wd, i, 'start', e.target.value)}
                    />
                    <span className={styles.dash}>até</span>
                    <input
                      className={styles.timeInput}
                      type="time"
                      value={r.end}
                      aria-invalid={problema ? true : undefined}
                      aria-label={`${nome}: fim da faixa ${i + 1}`}
                      onChange={(e) => setRange(wd, i, 'end', e.target.value)}
                    />
                    <button className={styles.xBtn} type="button" onClick={() => removeRange(wd, i)} aria-label="remover faixa">
                      ×
                    </button>
                  </div>
                  {problema && <span className={styles.error}>{problema.mensagem}</span>}
                </div>
              );
            })}
            <button className={styles.addRange} type="button" onClick={() => addRange(wd)}>
              + faixa
            </button>
          </div>
        </div>
      ))}

      <div className={styles.toolbar} style={{ gap: 8 }}>
        <button className={styles.smallBtn} type="button" onClick={onClose}>
          Cancelar
        </button>
        <Save bloqueado={problemas.length > 0} />
      </div>
    </form>
  );
}
