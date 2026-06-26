import Link from 'next/link';
import { DateTime } from 'luxon';
import { getMe, listAppointments, listServices, listProfessionals, type Appointment } from '@/lib/panel-api';
import { cancelAppointment } from '../actions';
import { CopyLink } from './CopyLink';
import styles from '../painel.module.css';

export const dynamic = 'force-dynamic';

function durationMin(a: Appointment): number {
  return Math.round(
    (new Date(a.endAt).getTime() - new Date(a.startAt).getTime()) / 60000,
  );
}

export default async function AgendaPage() {
  const me = await getMe();
  if (!me) return null; // o layout já redireciona
  const tz = me.business.timezone;

  const [appts, services, professionals] = await Promise.all([
    listAppointments(), // ativos, de agora pra frente
    listServices(),
    listProfessionals(),
  ]);

  // Onboarding: o que ainda falta pro negócio receber agendamentos.
  const temServico = services.some((s) => s.active);
  const temProf = professionals.some((p) => p.active);
  const setupPronto = temServico && temProf;

  // Agrupa por dia no fuso do negócio.
  const grupos = new Map<string, Appointment[]>();
  for (const a of appts) {
    const key = DateTime.fromISO(a.startAt).setZone(tz).toFormat('yyyy-MM-dd');
    (grupos.get(key) ?? grupos.set(key, []).get(key)!).push(a);
  }

  // Resumo: hoje, próximos 7 dias e receita prevista (dos ativos à frente).
  const hojeKey = DateTime.now().setZone(tz).toFormat('yyyy-MM-dd');
  const limite7 = DateTime.now().setZone(tz).plus({ days: 7 });
  const hojeCount = (grupos.get(hojeKey) ?? []).length;
  const semanaCount = appts.filter((a) => DateTime.fromISO(a.startAt).setZone(tz) <= limite7).length;
  const receitaCents = appts.reduce((s, a) => s + a.priceCents, 0);
  const receita = (receitaCents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'http://localhost:3001';

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Painel</p>
          <h1 className={styles.h1}>Agenda</h1>
          <p className={styles.lead}>Seus próximos atendimentos, do mais cedo ao mais tarde.</p>
        </div>
      </div>

      {!setupPronto && (
        <div className={`${styles.panel} ${styles.panelPad} ${styles.onboard}`}>
          <h2 className={styles.sectionTitle}>Primeiros passos</h2>
          <p className={styles.rowMeta} style={{ marginBottom: 14 }}>
            Faltam alguns passos pra sua agenda receber clientes.
          </p>
          <Link href="/painel/servicos" className={`${styles.onboardStep} ${temServico ? styles.onboardDone : ''}`}>
            <span className={styles.onboardCheck}>{temServico ? '✓' : '1'}</span>
            <span>Cadastrar seus serviços</span>
          </Link>
          <Link href="/painel/profissionais" className={`${styles.onboardStep} ${temProf ? styles.onboardDone : ''}`}>
            <span className={styles.onboardCheck}>{temProf ? '✓' : '2'}</span>
            <span>Adicionar profissionais e horários</span>
          </Link>
          <Link href="/painel/aparencia" className={styles.onboardStep}>
            <span className={styles.onboardCheck}>3</span>
            <span>Personalizar a página (logo, cor) — opcional</span>
          </Link>
        </div>
      )}

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{hojeCount}</span>
          <span className={styles.statLabel}>hoje</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{semanaCount}</span>
          <span className={styles.statLabel}>próximos 7 dias</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{receita}</span>
          <span className={styles.statLabel}>receita prevista</span>
        </div>
      </div>

      <CopyLink url={`${origin}/${me.business.slug}`} />

      <div className={styles.gap}>
        {grupos.size === 0 ? (
          <div className={styles.panel}>
            <p className={styles.empty}>
              Nenhum agendamento à frente. Divulgue seu link e eles aparecem aqui.
            </p>
          </div>
        ) : (
          [...grupos.entries()].map(([dia, lista]) => {
            const label = DateTime.fromISO(dia, { zone: tz }).setLocale('pt-BR');
            return (
              <section key={dia} className={styles.dayGroup}>
                <h2 className={styles.dayLabel}>
                  {label.toFormat('cccc')} <span>· {label.toFormat("dd 'de' LLLL")}</span>
                </h2>
                <div className={styles.panel}>
                  {lista.map((a) => {
                    const t = DateTime.fromISO(a.startAt).setZone(tz);
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
                          {a.paymentStatus === 'PENDING' && (
                            <span className={`${styles.chip} ${styles.chipWarn}`}>aguardando sinal</span>
                          )}
                          {a.paymentStatus === 'PAID' && (
                            <span className={`${styles.chip} ${styles.chipOk}`}>sinal pago</span>
                          )}
                          {a.confirmedByCustomer ? (
                            <span className={`${styles.chip} ${styles.chipOk}`}>✓ cliente confirmou</span>
                          ) : (
                            <span
                              className={`${styles.chip} ${
                                a.status === 'CONFIRMED' ? styles.chipOk : styles.chipWarn
                              }`}
                            >
                              {a.status === 'CONFIRMED' ? 'confirmado' : 'pendente'}
                            </span>
                          )}
                          <form action={cancelAppointment}>
                            <input type="hidden" name="id" value={a.id} />
                            <button className={`${styles.linkBtn} ${styles.dangerBtn}`} type="submit">
                              Cancelar
                            </button>
                          </form>
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
    </div>
  );
}
