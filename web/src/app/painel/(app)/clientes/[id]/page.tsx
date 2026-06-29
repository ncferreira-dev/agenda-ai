import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DateTime } from 'luxon';
import { getMe, getCustomerDetail, type CustomerDetail } from '@/lib/panel-api';
import { maskFormat } from '@/lib/format';
import { SegmentTag } from '../SegmentTag';
import { WhatsAppButton } from './WhatsAppButton';
import styles from '../../../painel.module.css';

export const dynamic = 'force-dynamic';

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateLabel(iso: string | null, tz: string): string {
  if (!iso) return '—';
  return DateTime.fromISO(iso).setZone(tz).setLocale('pt-BR').toFormat("dd/LL/yyyy");
}

const STATUS_LABEL: Record<CustomerDetail['history'][number]['status'], string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
  COMPLETED: 'Compareceu',
  NO_SHOW: 'Faltou',
};

export default async function ClienteFichaPage({ params }: { params: { id: string } }) {
  const me = await getMe();
  if (!me) return null;
  const tz = me.business.timezone;

  let c: CustomerDetail;
  try {
    c = await getCustomerDetail(params.id);
  } catch {
    notFound();
  }

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            <Link href="/painel/clientes" className={styles.altLink}>← Clientes</Link>
          </p>
          <h1 className={styles.h1} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {c.name ?? 'Sem nome'} <SegmentTag segment={c.segment} />
          </h1>
          <p className={styles.lead}>
            {maskFormat('phone', c.phone)}{c.email ? ` · ${c.email}` : ''}
          </p>
        </div>
        <WhatsAppButton phone={c.phone} message={c.whatsappMessage} />
      </div>

      {/* Números de CRM */}
      <div className={styles.stats}>
        <div className={styles.statCard}><span className={styles.statNum}>{brl(c.totalSpentCents)}</span><span className={styles.statLabel}>total gasto</span></div>
        <div className={styles.statCard}><span className={styles.statNum}>{c.visits}</span><span className={styles.statLabel}>visitas</span></div>
        <div className={styles.statCard}><span className={styles.statNum}>{brl(c.avgTicketCents)}</span><span className={styles.statLabel}>ticket médio</span></div>
      </div>
      <div className={styles.stats}>
        <div className={styles.statCard}><span className={styles.statNum} style={{ fontSize: 18 }}>{dateLabel(c.firstVisitAt, tz)}</span><span className={styles.statLabel}>primeira visita</span></div>
        <div className={styles.statCard}><span className={styles.statNum} style={{ fontSize: 18 }}>{dateLabel(c.lastVisitAt, tz)}</span><span className={styles.statLabel}>última visita</span></div>
      </div>

      {c.ownerNote && (
        <div className={`${styles.panel} ${styles.panelPad}`} style={{ marginTop: 14 }}>
          <span className={styles.label}>Sua observação</span>
          <p className={styles.customerNote} style={{ marginTop: 6 }}>📝 {c.ownerNote}</p>
        </div>
      )}

      {c.topServices.length > 0 && (
        <div className={`${styles.panel} ${styles.panelPad}`} style={{ marginTop: 14 }}>
          <h2 className={styles.sectionTitle}>Serviços mais feitos</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {c.topServices.map((s) => (
              <span key={s.name} className={`${styles.chip} ${styles.chipOff}`}>{s.name} · {s.count}</span>
            ))}
          </div>
        </div>
      )}

      {/* Histórico */}
      <div className={`${styles.panel}`} style={{ marginTop: 14 }}>
        <h2 className={styles.sectionTitle} style={{ padding: '16px 16px 0' }}>Histórico de atendimentos</h2>
        {c.history.length === 0 ? (
          <p className={styles.empty}>Nenhum atendimento ainda.</p>
        ) : (
          c.history.map((h) => (
            <div key={h.id} className={styles.appt}>
              <div className={styles.apptTime} style={{ minWidth: 96 }}>
                {DateTime.fromISO(h.startAt).setZone(tz).toFormat('dd/LL/yy')}
                <span className={styles.apptDur}>{DateTime.fromISO(h.startAt).setZone(tz).toFormat('HH:mm')}</span>
              </div>
              <div className={styles.rowMain}>
                <div className={styles.rowName}>
                  {h.items.length > 1 ? h.items.map((i) => i.name).join(' + ') : h.service}
                </div>
                <div className={styles.rowMeta}>com {h.professional} · {brl(h.totalCents)}</div>
              </div>
              <div className={styles.rowActions} style={{ gap: 6 }}>
                <span className={`${styles.chip} ${h.status === 'COMPLETED' ? styles.chipOk : h.status === 'NO_SHOW' ? styles.chipWarn : styles.chipOff}`}>
                  {STATUS_LABEL[h.status]}
                </span>
                {h.paid && <span className={`${styles.chip} ${styles.chipOk}`}>✓ pago</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
