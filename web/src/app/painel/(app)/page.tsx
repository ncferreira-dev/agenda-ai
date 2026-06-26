import Link from 'next/link';
import { DateTime } from 'luxon';
import { getMe, listAppointments, listServices, listProfessionals, type Appointment } from '@/lib/panel-api';
import { cancelAppointment, setAppointmentStatus } from '../actions';
import { CopyLink } from './CopyLink';
import styles from '../painel.module.css';

export const dynamic = 'force-dynamic';

function durationMin(a: Appointment): number {
  return Math.round((new Date(a.endAt).getTime() - new Date(a.startAt).getTime()) / 60000);
}

function StatusActions({ a, isPast }: { a: Appointment; isPast: boolean }) {
  if (isPast) {
    return (
      <>
        <form action={setAppointmentStatus}>
          <input type="hidden" name="id" value={a.id} />
          <input type="hidden" name="status" value="COMPLETED" />
          <button className={`${styles.linkBtn}`} type="submit">Concluído</button>
        </form>
        <form action={setAppointmentStatus}>
          <input type="hidden" name="id" value={a.id} />
          <input type="hidden" name="status" value="NO_SHOW" />
          <button className={`${styles.linkBtn} ${styles.dangerBtn}`} type="submit">Faltou</button>
        </form>
      </>
    );
  }
  return (
    <form action={cancelAppointment}>
      <input type="hidden" name="id" value={a.id} />
      <button className={`${styles.linkBtn} ${styles.dangerBtn}`} type="submit">Cancelar</button>
    </form>
  );
}

export default async function AgendaPage({ searchParams }: { searchParams: { v?: string } }) {
  const me = await getMe();
  if (!me) return null;
  const tz = me.business.timezone;
  const view = searchParams.v === 'semana' ? 'semana' : 'lista';

  const now = DateTime.now().setZone(tz);
  const startToday = now.startOf('day');
  const weekStart = now.startOf('week');
  const horizon = now.plus({ days: me.business.maxAdvanceDays + 1 });

  const [appts, services, professionals] = await Promise.all([
    listAppointments({ from: weekStart.toISO()!, to: horizon.toISO()! }),
    listServices(),
    listProfessionals(),
  ]);

  const temServico = services.some((s) => s.active);
  const temProf = professionals.some((p) => p.active);
  const setupPronto = temServico && temProf;

  // Lista: de hoje pra frente. Semana: a semana corrente inteira.
  const lista = appts.filter((a) => DateTime.fromISO(a.startAt).setZone(tz) >= startToday);

  const grupos = new Map<string, Appointment[]>();
  for (const a of lista) {
    const key = DateTime.fromISO(a.startAt).setZone(tz).toFormat('yyyy-MM-dd');
    (grupos.get(key) ?? grupos.set(key, []).get(key)!).push(a);
  }

  const hojeKey = now.toFormat('yyyy-MM-dd');
  const limite7 = now.plus({ days: 7 });
  const hojeCount = (grupos.get(hojeKey) ?? []).length;
  const semanaCount = lista.filter((a) => DateTime.fromISO(a.startAt).setZone(tz) <= limite7).length;
  const receita = (lista.reduce((s, a) => s + a.priceCents, 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:3001';
  const nowMs = Date.now();

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Painel</p>
          <h1 className={styles.h1}>Agenda</h1>
          <p className={styles.lead}>Seus atendimentos — em lista ou na visão da semana.</p>
        </div>
        <div className={styles.periodTabs}>
          <Link href="/painel?v=lista" className={`${styles.periodTab} ${view === 'lista' ? styles.periodTabActive : ''}`}>Lista</Link>
          <Link href="/painel?v=semana" className={`${styles.periodTab} ${view === 'semana' ? styles.periodTabActive : ''}`}>Semana</Link>
        </div>
      </div>

      {!setupPronto && (
        <div className={`${styles.panel} ${styles.panelPad} ${styles.onboard}`}>
          <h2 className={styles.sectionTitle}>Primeiros passos</h2>
          <p className={styles.rowMeta} style={{ marginBottom: 14 }}>Faltam alguns passos pra sua agenda receber clientes.</p>
          <Link href="/painel/servicos" className={`${styles.onboardStep} ${temServico ? styles.onboardDone : ''}`}>
            <span className={styles.onboardCheck}>{temServico ? '✓' : '1'}</span><span>Cadastrar seus serviços</span>
          </Link>
          <Link href="/painel/profissionais" className={`${styles.onboardStep} ${temProf ? styles.onboardDone : ''}`}>
            <span className={styles.onboardCheck}>{temProf ? '✓' : '2'}</span><span>Adicionar profissionais e horários</span>
          </Link>
          <Link href="/painel/aparencia" className={styles.onboardStep}>
            <span className={styles.onboardCheck}>3</span><span>Personalizar a página (logo, cor) — opcional</span>
          </Link>
        </div>
      )}

      <div className={styles.stats}>
        <div className={styles.statCard}><span className={styles.statNum}>{hojeCount}</span><span className={styles.statLabel}>hoje</span></div>
        <div className={styles.statCard}><span className={styles.statNum}>{semanaCount}</span><span className={styles.statLabel}>próximos 7 dias</span></div>
        <div className={styles.statCard}><span className={styles.statNum}>{receita}</span><span className={styles.statLabel}>receita prevista</span></div>
      </div>

      <CopyLink url={`${origin}/${me.business.slug}`} />

      {view === 'semana' ? (
        <div className={`${styles.gap} ${styles.week}`}>
          {Array.from({ length: 7 }, (_, i) => {
            const day = weekStart.plus({ days: i });
            const key = day.toFormat('yyyy-MM-dd');
            const doDia = appts
              .filter((a) => DateTime.fromISO(a.startAt).setZone(tz).toFormat('yyyy-MM-dd') === key)
              .sort((x, y) => x.startAt.localeCompare(y.startAt));
            const isToday = key === hojeKey;
            return (
              <div key={key} className={styles.weekCol}>
                <div className={`${styles.weekHead} ${isToday ? styles.weekHeadToday : ''}`}>
                  <span className={styles.weekWd}>{day.setLocale('pt-BR').toFormat('ccc')}</span>
                  <span className={styles.weekDay}>{day.toFormat('dd')}</span>
                </div>
                <div className={styles.weekBody}>
                  {doDia.length === 0 && <span className={styles.weekEmpty}>—</span>}
                  {doDia.map((a) => (
                    <div key={a.id} className={styles.weekBlock}>
                      <span className={styles.weekTime}>{DateTime.fromISO(a.startAt).setZone(tz).toFormat('HH:mm')}</span>
                      <span className={styles.weekSvc}>{a.service}</span>
                      <span className={styles.weekPro}>{a.professional}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.gap}>
          {grupos.size === 0 ? (
            <div className={styles.panel}>
              <p className={styles.empty}>Nenhum agendamento à frente. Divulgue seu link e eles aparecem aqui.</p>
            </div>
          ) : (
            [...grupos.entries()].map(([dia, listaDia]) => {
              const label = DateTime.fromISO(dia, { zone: tz }).setLocale('pt-BR');
              return (
                <section key={dia} className={styles.dayGroup}>
                  <h2 className={styles.dayLabel}>
                    {label.toFormat('cccc')} <span>· {label.toFormat("dd 'de' LLLL")}</span>
                  </h2>
                  <div className={styles.panel}>
                    {listaDia.map((a) => {
                      const t = DateTime.fromISO(a.startAt).setZone(tz);
                      const isPast = new Date(a.startAt).getTime() < nowMs;
                      return (
                        <div key={a.id} className={styles.appt}>
                          <div className={styles.apptTime}>
                            {t.toFormat('HH:mm')}
                            <span className={styles.apptDur}>{durationMin(a)} min</span>
                          </div>
                          <div className={styles.rowMain}>
                            <div className={styles.rowName}>{a.service}</div>
                            <div className={styles.rowMeta}>
                              com {a.professional} · {a.customer.name ?? 'cliente'} · {a.customer.phone}
                            </div>
                          </div>
                          <div className={styles.rowActions}>
                            {a.paymentStatus === 'PENDING' && <span className={`${styles.chip} ${styles.chipWarn}`}>aguardando sinal</span>}
                            {a.paymentStatus === 'PAID' && <span className={`${styles.chip} ${styles.chipOk}`}>sinal pago</span>}
                            {a.confirmedByCustomer && <span className={`${styles.chip} ${styles.chipOk}`}>✓ confirmou</span>}
                            <StatusActions a={a} isPast={isPast} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
