import Link from 'next/link';
import { DateTime } from 'luxon';
import {
  getMe,
  getReport,
  getProfessionalRevenue,
  listProfessionals,
  type ReportBreakdown,
  type ProfessionalRevenueReport,
} from '@/lib/panel-api';
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

// Tempo trabalhado: minutos e horas (h/min); dias entram na meta da linha.
function tempoTrabalhado(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hhmm = h > 0 ? `${h}h${m ? ` ${m}min` : ''}` : `${m}min`;
  return `${min} min (${hhmm})`;
}

const diasLabel = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

// Faturamento por profissional — só atendimentos concluídos/pagos (realizados).
function RevenueByProfessional({ report }: { report: ProfessionalRevenueReport }) {
  return (
    <div className={`${styles.panel} ${styles.panelPad}`}>
      <h2 className={styles.sectionTitle}>Faturamento por profissional</h2>
      <p className={styles.rowMeta} style={{ marginTop: 4 }}>
        <strong>Faturamento realizado</strong> = atendimentos concluídos ou pagos no período (não inclui
        previstos nem a receber), pelo total final de cada atendimento. Tempo trabalhado = soma da duração
        dos atendimentos; dias = dias distintos com atendimento no período.
      </p>
      {report.professionals.length === 0 ? (
        <p className={styles.rowMeta} style={{ marginTop: 12 }}>Sem dados no período.</p>
      ) : (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <div className={styles.reportRow} style={{ opacity: 0.7 }}>
            <span className={styles.reportCount}>Profissional</span>
            <span className={styles.reportCount}>Faturamento realizado</span>
          </div>
          {report.professionals.map((r) => (
            <div key={r.professionalId} className={styles.reportRow}>
              <span className={styles.reportName}>
                {r.name}{' '}
                <span className={styles.reportCount}>
                  · {r.count} atend. · {tempoTrabalhado(r.workedMinutes)} · {diasLabel(r.daysWorked)}
                </span>
              </span>
              <span className={styles.reportVal}>{brl(r.generatedCents)}</span>
            </div>
          ))}
          <div className={styles.reportRow} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, fontWeight: 600 }}>
            <span className={styles.reportName}>
              Total{' '}
              <span className={styles.reportCount}>
                · {report.totalCount} atend. · {tempoTrabalhado(report.totalWorkedMinutes)} · {diasLabel(report.totalDaysWorked)}
              </span>
            </span>
            <span className={styles.reportVal}>{brl(report.totalGeneratedCents)}</span>
          </div>
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
  searchParams: { p?: string; prof?: string };
}) {
  const me = await getMe();
  if (!me) return null;

  const p: Periodo = (['dia', 'semana', 'mes'] as const).includes(searchParams.p as Periodo)
    ? (searchParams.p as Periodo)
    : 'mes';
  const { from, to } = range(p, me.business.timezone);

  const professionals = await listProfessionals();
  const prof = professionals.some((x) => x.id === searchParams.prof)
    ? searchParams.prof
    : undefined;

  const [report, byPro] = await Promise.all([
    getReport(from, to),
    getProfessionalRevenue(from, to, prof),
  ]);

  // Preserva o filtro de profissional ao trocar de período, e vice-versa.
  const href = (params: { p?: Periodo; prof?: string | null }) => {
    const qs = new URLSearchParams();
    qs.set('p', params.p ?? p);
    const pf = params.prof === undefined ? prof : params.prof;
    if (pf) qs.set('prof', pf);
    return `/painel/relatorio?${qs}`;
  };

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
            href={href({ p: opt })}
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

      <div className={styles.gap}>
        <div className={styles.periodTabs} style={{ marginBottom: 12 }}>
          <Link
            href={href({ prof: null })}
            className={`${styles.periodTab} ${!prof ? styles.periodTabActive : ''}`}
          >
            Todos
          </Link>
          {professionals.map((x) => (
            <Link
              key={x.id}
              href={href({ prof: x.id })}
              className={`${styles.periodTab} ${prof === x.id ? styles.periodTabActive : ''}`}
            >
              {x.name}
            </Link>
          ))}
        </div>
        <RevenueByProfessional report={byPro} />
      </div>
    </div>
  );
}
