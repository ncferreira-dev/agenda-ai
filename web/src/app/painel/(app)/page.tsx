import { DateTime } from 'luxon';
import { getMe, listAppointments, type Appointment } from '@/lib/panel-api';
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

  const appts = await listAppointments(); // ativos, de agora pra frente

  // Agrupa por dia no fuso do negócio.
  const grupos = new Map<string, Appointment[]>();
  for (const a of appts) {
    const key = DateTime.fromISO(a.startAt).setZone(tz).toFormat('yyyy-MM-dd');
    (grupos.get(key) ?? grupos.set(key, []).get(key)!).push(a);
  }

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
                          <span
                            className={`${styles.chip} ${
                              a.status === 'CONFIRMED' ? styles.chipOk : styles.chipWarn
                            }`}
                          >
                            {a.status === 'CONFIRMED' ? 'confirmado' : 'pendente'}
                          </span>
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
