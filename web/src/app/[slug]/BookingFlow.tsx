'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { getAvailability, createBooking, getMyAppointments, cancelMyAppointment } from '@/lib/api';
import type { BusinessPage, ProfessionalAvailability, BookingResult, MyAppointment } from '@/lib/types';
import styles from './booking.module.css';

interface DisplaySlot {
  startAt: string;
  label: string;
  professionalId: string;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function nextDays(count: number): { iso: string; weekday: string; day: number; wd: number }[] {
  const out = [];
  const base = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ iso, weekday: WEEKDAYS[d.getDay()], day: d.getDate(), wd: d.getDay() });
  }
  return out;
}

function formatPrice(cents: number): string {
  if (!cents) return '';
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
}

function PeopleIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 6.5a3 3 0 0 1 0 5.6M16.5 14c2.5.3 4 2.2 4 5" />
    </svg>
  );
}

export function BookingFlow({ slug, data }: { slug: string; data: BusinessPage }) {
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState<string | null>(null); // null = qualquer
  const [date, setDate] = useState<string | null>(null);
  const [availability, setAvailability] = useState<ProfessionalAvailability[]>([]);
  const [slot, setSlot] = useState<DisplaySlot | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [view, setView] = useState<'book' | 'mine'>('book');
  // true depois que o cliente escolhe um dia na mão (trava o auto-avanço).
  const manualDate = useRef(false);
  // Âncoras pra rolar suavemente até a seção que acabou de surgir (mobile).
  const scheduleRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  const service = data.services.find((s) => s.id === serviceId) ?? null;

  const eligiblePros = useMemo(
    () => (serviceId ? data.professionals.filter((p) => p.serviceIds.includes(serviceId)) : []),
    [serviceId, data.professionals],
  );

  const days = useMemo(() => nextDays(Math.min(data.business.maxAdvanceDays, 14)), [data]);
  // Dias da semana fechados (bloqueio recorrente do negócio o dia todo).
  const closedWeekdays = useMemo(
    () => new Set(data.business.closedWeekdays ?? []),
    [data.business.closedWeekdays],
  );
  // 1º dia atendido (pula os fechados) — usado como ponto de partida.
  const firstOpen = useMemo(
    () => (days.find((d) => !closedWeekdays.has(d.wd)) ?? days[0]).iso,
    [days, closedWeekdays],
  );

  // Busca disponibilidade sempre que muda serviço, dia ou profissional na tela de
  // agenda. Se o dia escolhido automaticamente vier vazio, pula pro próximo dia
  // com horário (evita a primeira tela "sem horários", que espanta o cliente).
  useEffect(() => {
    if (!serviceId || !date) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAvailability({ slug, serviceId, date, professionalId: professionalId ?? undefined })
      .then((av) => {
        if (cancelled) return;
        setAvailability(av);
        const hasSlots = av.some((p) => p.slots.length > 0);
        if (!hasSlots && !manualDate.current) {
          const idx = days.findIndex((d) => d.iso === date);
          // pula direto pro próximo dia atendido (ignora fechados)
          const next = idx >= 0 ? days.slice(idx + 1).find((d) => !closedWeekdays.has(d.wd)) : undefined;
          if (next) {
            setDate(next.iso); // segue carregando até achar um dia com horário
            return;
          }
        }
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        // Zera os horários: sem isto, os slots do dia/profissional carregados
        // ANTES continuam na tela enquanto a tira de datas já marca o novo dia.
        // Cada slot carrega o startAt absoluto do dia velho, e confirmar mandaria
        // o cliente pro dia errado. Vazio -> a grade cai em "Sem horários".
        setAvailability([]);
        setError(e?.message ?? 'Não consegui carregar os horários.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, date, professionalId, slug, days, closedWeekdays]);

  // Rola até a agenda quando um serviço é escolhido, e até o formulário quando
  // um horário é escolhido — a página é única, então guiamos o olho no mobile.
  useEffect(() => {
    if (serviceId) scheduleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [serviceId]);
  useEffect(() => {
    if (slot) detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [slot]);

  const displaySlots: DisplaySlot[] = useMemo(() => {
    const byLabel = new Map<string, DisplaySlot>();
    for (const pa of availability) {
      for (const s of pa.slots) {
        if (!byLabel.has(s.label)) byLabel.set(s.label, { ...s, professionalId: pa.professionalId });
      }
    }
    return [...byLabel.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [availability]);

  const manha = displaySlots.filter((s) => Number(s.label.slice(0, 2)) < 12);
  const tarde = displaySlots.filter((s) => Number(s.label.slice(0, 2)) >= 12);

  function pickService(id: string) {
    setServiceId(id);
    setProfessionalId(null);
    setSlot(null);
    manualDate.current = false;
    setDate(firstOpen);
  }

  async function confirm() {
    if (!service || !slot) return;
    if (!name.trim() || phone.replace(/\D/g, '').length < 10) {
      setError('Preencha seu nome e um telefone válido.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await createBooking({
        slug,
        serviceId: service.id,
        professionalId: slot.professionalId,
        startAt: slot.startAt,
        name: name.trim(),
        phone: normalizePhone(phone),
        email: email.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setResult(res);
    } catch (e: any) {
      setError(e?.message ?? 'Não consegui concluir o agendamento.');
    } finally {
      setLoading(false);
    }
  }

  // --- Sucesso ------------------------------------------------------------
  if (result) {
    const when = new Date(result.startAt);
    const whenLabel = `${WEEKDAYS[when.getDay()]}, ${when.getDate()} de ${MONTHS[when.getMonth()]} às ${pad(when.getHours())}:${pad(when.getMinutes())}`;
    const dur = service?.durationMinutes ?? 30;
    const end = new Date(when.getTime() + dur * 60000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const gcal =
      `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(`${result.service} na ${data.business.name}`)}` +
      `&dates=${fmt(when)}/${fmt(end)}` +
      `&details=${encodeURIComponent(`Com ${result.professional}`)}` +
      (data.business.address ? `&location=${encodeURIComponent(data.business.address)}` : '');
    return (
      <div className={styles.success}>
        <div className={styles.successMark}>✓</div>
        <h2 className={styles.successTitle}>Agendado!</h2>
        <p className={styles.successDetail}>
          {result.service} com {result.professional}
          <br />
          {whenLabel}
        </p>
        {data.business.address && (
          <a
            className={styles.successAddr}
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.business.address)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            📍 {data.business.address}
          </a>
        )}
        <a className={styles.calBtn} href={gcal} target="_blank" rel="noopener noreferrer">
          Adicionar ao calendário
        </a>
        <p className={styles.successNote}>Você vai receber um lembrete antes do horário.</p>
      </div>
    );
  }

  if (view === 'mine') {
    return <MyAppointmentsView slug={slug} onBack={() => setView('book')} />;
  }

  return (
    <div className={styles.flow}>
      {error && <div className={styles.error}>{error}</div>}

      {/* 1. Serviço */}
      <section>
        <div className={styles.serviceHead}>
          <h2 className={styles.stepTitle}>Escolha o serviço</h2>
          <button className={styles.linkAction} onClick={() => setView('mine')} type="button">
            Meus agendamentos
          </button>
        </div>
        {data.services.length === 0 && (
          <p className={styles.hint}>
            Este negócio ainda está montando a agenda. Volte em breve! 🙂
          </p>
        )}
        <div className={styles.serviceList}>
          {data.services.map((s) => (
            <button
              key={s.id}
              className={`${styles.serviceRow} ${serviceId === s.id ? styles.serviceRowSelected : ''}`}
              onClick={() => pickService(s.id)}
            >
              <div>
                <div className={styles.serviceName}>{s.name}</div>
                {s.isKit && s.includes && s.includes.length > 0 && (
                  <div className={styles.serviceIncludes}>Inclui: {s.includes.join(' + ')}</div>
                )}
                <div className={styles.serviceMeta}>
                  {(() => {
                    const full = s.priceCents;
                    const final = s.finalPriceCents ?? full;
                    const hasDiscount = final < full;
                    if (!full && !final) return null;
                    return (
                      <span className={styles.priceGroup}>
                        {hasDiscount && (
                          <span className={styles.priceFull}>{formatPrice(full)}</span>
                        )}
                        {formatPrice(final) && (
                          <span className={styles.servicePrice}>{formatPrice(final)}</span>
                        )}
                      </span>
                    );
                  })()}
                  <span>{s.durationMinutes} min</span>
                </div>
              </div>
              <span className={styles.agendarBtn}>
                {serviceId === s.id ? 'Selecionado' : 'Agendar'}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 2. Profissional + data + horários — surge ao escolher o serviço */}
      {service && (
        <section ref={scheduleRef} className={styles.reveal}>
          <div className={styles.divider} />

          <h2 className={styles.stepTitle}>Selecione o profissional</h2>
          <div className={styles.avatarRow}>
            <button
              className={`${styles.avatar} ${professionalId === null ? styles.avatarSelected : ''}`}
              onClick={() => {
                setProfessionalId(null);
                setSlot(null);
              }}
            >
              <span className={styles.avatarCircle}>
                <PeopleIcon />
              </span>
              <span className={styles.avatarName}>Qualquer</span>
            </button>
            {eligiblePros.map((p) => (
              <button
                key={p.id}
                className={`${styles.avatar} ${professionalId === p.id ? styles.avatarSelected : ''}`}
                onClick={() => {
                  setProfessionalId(p.id);
                  setSlot(null);
                }}
              >
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.avatarCircle} src={p.photoUrl} alt={p.name} />
                ) : (
                  <span className={styles.avatarCircle}>{initials(p.name).toUpperCase()}</span>
                )}
                <span className={styles.avatarName}>{p.name}</span>
              </button>
            ))}
          </div>

          <div className={styles.divider} />

          <div className={styles.dateStrip}>
            {days.map((d) => {
              const closed = closedWeekdays.has(d.wd);
              return (
                <button
                  key={d.iso}
                  className={`${styles.dateChip} ${closed ? styles.dateChipClosed : ''}`}
                  disabled={closed}
                  title={closed ? 'Fechado' : undefined}
                  onClick={() => {
                    if (closed) return;
                    manualDate.current = true;
                    setDate(d.iso);
                    setSlot(null);
                  }}
                >
                  <span className={styles.dateWeekday}>{d.weekday}</span>
                  <span className={`${styles.dateNum} ${date === d.iso ? styles.dateNumActive : ''}`}>
                    {d.day}
                  </span>
                  {closed && <span className={styles.dateClosedTag}>fechado</span>}
                </button>
              );
            })}
          </div>

          <h2 className={styles.stepTitle}>Horários disponíveis</h2>
          {loading && <p className={styles.hint}>Procurando horários…</p>}
          {!loading && displaySlots.length === 0 && (
            <p className={styles.hint}>Sem horários nesse dia. Toque em outro dia acima ☝️</p>
          )}

          {!loading && manha.length > 0 && (
            <SlotSection label="Manhã" slots={manha} onPick={setSlot} active={slot} />
          )}
          {!loading && tarde.length > 0 && (
            <SlotSection label="Tarde" slots={tarde} onPick={setSlot} active={slot} />
          )}
        </section>
      )}

      {/* 3. Dados — surge ao escolher o horário */}
      {service && slot && (
        <section ref={detailsRef} className={styles.reveal}>
          <div className={styles.divider} />
          <h2 className={styles.stepTitle}>Seus dados</h2>
          <div className={styles.summary}>
            {service.name} · {slot.label}
          </div>
          <label className={styles.label}>
            Nome
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
          </label>
          <label className={styles.label}>
            WhatsApp
            <input
              className={styles.input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              inputMode="tel"
            />
          </label>
          <label className={styles.label}>
            E-mail (opcional, pra confirmação)
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              inputMode="email"
            />
          </label>
          <label className={styles.label}>
            Observação (opcional)
            <textarea
              className={styles.input}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Algo que o profissional precise saber?"
              rows={2}
            />
          </label>
          <button className={styles.buttonPrimary} onClick={confirm} disabled={loading}>
            {loading ? 'Agendando…' : 'Confirmar agendamento'}
          </button>
        </section>
      )}
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function MyAppointmentsView({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [phone, setPhone] = useState('');
  const [list, setList] = useState<MyAppointment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Informe um telefone válido.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setList(await getMyAppointments(slug, phone));
    } catch (err: any) {
      setError(err?.message ?? 'Não consegui buscar.');
    } finally {
      setLoading(false);
    }
  }

  async function cancelar(id: string) {
    if (confirmingId !== id) {
      setConfirmingId(id);
      return;
    }
    try {
      await cancelMyAppointment(slug, id, phone);
      setList((l) => l?.filter((a) => a.id !== id) ?? null);
      setConfirmingId(null);
    } catch (err: any) {
      setError(err?.message ?? 'Não consegui cancelar.');
    }
  }

  return (
    <div className={styles.flow}>
      <button className={styles.back} onClick={onBack}>
        ← Agendar
      </button>
      <h2 className={styles.stepTitle}>Meus agendamentos</h2>
      {error && <div className={styles.error}>{error}</div>}

      <form onSubmit={buscar}>
        <label className={styles.label}>
          Seu WhatsApp
          <input
            className={styles.input}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(11) 99999-9999"
            inputMode="tel"
          />
        </label>
        <button className={styles.buttonPrimary} type="submit" disabled={loading}>
          {loading ? 'Buscando…' : 'Ver meus horários'}
        </button>
      </form>

      {list && list.length === 0 && (
        <p className={styles.hint}>Nenhum horário ativo nesse telefone.</p>
      )}
      {list && list.length > 0 && (
        <div className={styles.serviceList} style={{ marginTop: 18 }}>
          {list.map((a) => {
            const w = new Date(a.startAt);
            const when = `${WEEKDAYS[w.getDay()]}, ${w.getDate()} de ${MONTHS[w.getMonth()]} às ${pad(w.getHours())}:${pad(w.getMinutes())}`;
            return (
              <div key={a.id} className={styles.serviceRow} style={{ cursor: 'default' }}>
                <div style={{ minWidth: 0 }}>
                  <div className={styles.serviceName}>{a.service}</div>
                  <div className={styles.serviceMeta}>com {a.professional} · {when}</div>
                </div>
                <button
                  className={`${styles.cancelBtn} ${confirmingId === a.id ? styles.cancelBtnArmed : ''}`}
                  onClick={() => cancelar(a.id)}
                  type="button"
                >
                  {confirmingId === a.id ? 'Confirmar?' : 'Cancelar'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SlotSection({
  label,
  slots,
  active,
  onPick,
}: {
  label: string;
  slots: DisplaySlot[];
  active: DisplaySlot | null;
  onPick: (s: DisplaySlot) => void;
}) {
  return (
    <div className={styles.daySection}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>{label}</span>
        <span className={styles.sectionLine} />
        <span className={styles.sectionCount}>{slots.length} horários</span>
      </div>
      <div className={styles.slotGrid}>
        {slots.map((s) => (
          <button
            key={s.startAt}
            className={`${styles.slot} ${active?.startAt === s.startAt ? styles.slotActive : ''}`}
            onClick={() => onPick(s)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
