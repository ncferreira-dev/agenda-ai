import Link from 'next/link';
import { DateTime } from 'luxon';
import { getMe, getReport, type ReportBreakdown } from '@/lib/panel-api';
import styles from '../../painel.module.css';

export const dynamic = 'force-dynamic';

type Periodo = 'dia' | 'semana' | 'mes';
const LABELS: Record<Periodo, string> = {
  dia: 'Hoje',
  semana: 'Esta semana',
  mes: 'Este mês',
};

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function range(p: Periodo, tz: string): { from: string; to: string } {
  const now = DateTime.now().setZone(tz);
  if (p === 'dia') {
    const start = now.startOf('day');
    return { from: start.toISO()!, to: start.plus({ days: 1 }).toISO()! };
  }
  if (p === 'semana') {
    const start = now.startOf('week');
    return { from: start.toISO()!, to: start.plus({ weeks: 1 }).toISO()! };
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

// Um balde financeiro (previsto / a receber / recebido).
function Bucket({ label, cents, count, hint, ok }: { label: string; cents: number; count: number; hint: string; ok?: boolean }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statNum} style={{ fontSize: 20, color: ok ? 'var(--accent, #1F4D3A)' : undefined }}>
        {brl(cents)}
      </span>
      <span className={styles.statLabel}>{label} · {count}</span>
      <span className={styles.rowMeta} style={{ fontSize: 11.5, marginTop: 2 }}>{hint}</span>
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

  const p: Periodo = (['dia', 'semana', 'mes'] as const).includes(searchParams.p as Periodo)
    ? (searchParams.p as Periodo)
    : 'mes';
  const { from, to } = range(p, me.business.timezone);
  const report = await getReport(from, to);

  const total = report.previstoCents + report.aReceberCents + report.recebidoCents;

  return (
    <div className={styles.rise}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Painel</p>
          <h1 className={styles.h1}>Faturamento</h1>
          <p className={styles.lead}>O que está previsto, o que falta receber e o que já entrou.</p>
        </div>
      </div>

      <div className={styles.periodTabs}>
        {(['dia', 'semana', 'mes'] as Periodo[]).map((opt) => (
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
        <Bucket label="Previsto" cents={report.previstoCents} count={report.previstoCount} hint="futuros confirmados, não pagos" />
        <Bucket label="A receber" cents={report.aReceberCents} count={report.aReceberCount} hint="já atendidos, não pagos" />
        <Bucket label="Recebido" cents={report.recebidoCents} count={report.recebidoCount} hint="pagos" ok />
      </div>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statNum}>{brl(total)}</span>
          <span className={styles.statLabel}>total movimentado no período</span>
        </div>
      </div>

      <div className={styles.gap} style={{ display: 'grid', gap: 14 }}>
        <Breakdown title="Por serviço" items={report.byService} />
        <Breakdown title="Por profissional" items={report.byProfessional} />
      </div>
    </div>
  );
}
