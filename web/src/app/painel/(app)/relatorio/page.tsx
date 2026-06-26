import Link from 'next/link';
import { DateTime } from 'luxon';
import { getMe, getReport, type ReportBreakdown } from '@/lib/panel-api';
import styles from '../../painel.module.css';

export const dynamic = 'force-dynamic';

type Periodo = 'semana' | 'mes' | '30d';
const LABELS: Record<Periodo, string> = {
  semana: 'Esta semana',
  mes: 'Este mês',
  '30d': 'Últimos 30 dias',
};

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function range(p: Periodo, tz: string): { from: string; to: string } {
  const now = DateTime.now().setZone(tz);
  if (p === 'semana') {
    const start = now.startOf('week');
    return { from: start.toISO()!, to: start.plus({ weeks: 1 }).toISO()! };
  }
  if (p === '30d') {
    return { from: now.startOf('day').minus({ days: 29 }).toISO()!, to: now.plus({ days: 1 }).startOf('day').toISO()! };
  }
  const start = now.startOf('month');
  return { from: start.toISO()!, to: start.plus({ months: 1 }).toISO()! };
}

function Breakdown({ title, items }: { title: string; items: ReportBreakdown[] }) {
  const max = Math.max(1, ...items.map((i) => i.cents));
  return (
    <div className={`${styles.panel} ${styles.panelPad}`}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {items.length === 0 ? (
        <p className={styles.rowMeta} style={{ marginTop: 8 }}>Sem dados no período.</p>
      ) : (
        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          {items.map((i) => (
            <div key={i.name}>
              <div className={styles.reportRow}>
                <span className={styles.reportName}>{i.name}</span>
                <span className={styles.reportVal}>
                  {brl(i.cents)} <span className={styles.reportCount}>· {i.count}</span>
                </span>
              </div>
              <div className={styles.bar}>
                <div className={styles.barFill} style={{ width: `${(i.cents / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function RelatorioPage({
  searchParams,
}: {
  searchParams: { p?: string };
}) {
  const me = await getMe();
  if (!me) return null;

  const p: Periodo = (['semana', 'mes', '30d'] as const).includes(searchParams.p as Periodo)
    ? (searchParams.p as Periodo)
    : 'mes';
  const { from, to } = range(p, me.business.timezone);
  const report = await getReport(from, to);

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Painel</p>
          <h1 className={styles.h1}>Faturamento</h1>
          <p className={styles.lead}>Quanto entrou e o que está marcado, por período.</p>
        </div>
      </div>

      <div className={styles.periodTabs}>
        {(['semana', 'mes', '30d'] as Periodo[]).map((opt) => (
          <Link
            key={opt}
            href={`/painel/relatorio?p=${opt}`}
            className={`${styles.periodTab} ${p === opt ? styles.periodTabActive : ''}`}
          >
            {LABELS[opt]}
          </Link>
        ))}
      </div>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{brl(report.totalCents)}</span>
          <span className={styles.statLabel}>total no período</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{report.totalCount}</span>
          <span className={styles.statLabel}>atendimentos</span>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statNum} style={{ fontSize: 20 }}>{brl(report.realizedCents)}</span>
          <span className={styles.statLabel}>já realizado</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNum} style={{ fontSize: 20 }}>{brl(report.scheduledCents)}</span>
          <span className={styles.statLabel}>ainda por vir</span>
        </div>
      </div>

      <div className={styles.gap} style={{ display: 'grid', gap: 14 }}>
        <Breakdown title="Por serviço" items={report.byService} />
        <Breakdown title="Por profissional" items={report.byProfessional} />
      </div>
    </div>
  );
}
