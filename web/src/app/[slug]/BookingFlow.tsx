'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { getAvailability, createBooking } from '@/lib/api';
import type { BusinessPage, ProfessionalAvailability, BookingResult } from '@/lib/types';
import styles from './booking.module.css';

type Step = 'service' | 'schedule' | 'details' | 'done';

interface DisplaySlot {
  startAt: string;
  label: string;
  professionalId: string;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function nextDays(count: number): { iso: string; weekday: string; day: number }[] {
  const out = [];
  const base = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ iso, weekday: WEEKDAYS[d.getDay()], day: d.getDate() });
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
  const [step, setStep] = useState<Step>('service');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState<string | null>(null); // null = qualquer
  const [date, setDate] = useState<string | null>(null);
  const [availability, setAvailability] = useState<ProfessionalAvailability[]>([]);
  const [slot, setSlot] = useState<DisplaySlot | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);
  // true depois que o cliente escolhe um dia na mão (trava o auto-avanço).
  const manualDate = useRef(false);

  const service = data.services.find((s) => s.id === serviceId) ?? null;

  const eligiblePros = useMemo(
    () => (serviceId ? data.professionals.filter((p) => p.serviceIds.includes(serviceId)) : []),
    [serviceId, data.professionals],
  );

  const days = useMemo(() => nextDays(Math.min(data.business.maxAdvanceDays, 14)), [data]);

  // Busca disponibilidade sempre que muda serviço, dia ou profissional na tela de
  // agenda. Se o dia escolhido automaticamente vier vazio, pula pro próximo dia
  // com horário (evita a primeira tela "sem horários", que espanta o cliente).
  useEffect(() => {
    if (step !== 'schedule' || !serviceId || !date) return;
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
          if (idx >= 0 && idx < days.length - 1) {
            setDate(days[idx + 1].iso); // segue carregando até achar um dia com horário
            return;
          }
        }
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? 'Não consegui carregar os horários.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, serviceId, date, professionalId, slug, days]);

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
    setDate(days[0].iso);
    setStep('schedule');
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
        notes: notes.trim() || undefined,
      });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      setResult(res);
      setStep('done');
    } catch (e: any) {
      setError(e?.message ?? 'Não consegui concluir o agendamento.');
    } finally {
      setLoading(false);
    }
  }

  // --- Sucesso ------------------------------------------------------------
  if (step === 'done' && result) {
    const when = new Date(result.startAt);
    const whenLabel = `${WEEKDAYS[when.getDay()]}, ${when.getDate()} de ${MONTHS[when.getMonth()]} às ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
    return (
      <div className={styles.success}>
        <div className={styles.successMark}>✓</div>
        <h2 className={styles.successTitle}>Agendado!</h2>
        <p className={styles.successDetail}>
          {result.service} com {result.professional}
          <br />
          {whenLabel}
        </p>
        <p className={styles.successNote}>Você vai receber um lembrete antes do horário.</p>
      </div>
    );
  }

  return (
    <div className={styles.flow}>
      {error && <div className={styles.error}>{error}</div>}

      {/* 1. Serviço */}
      {step === 'service' && (
        <section>
          <h2 className={styles.stepTitle}>Escolha o serviço</h2>
          <div className={styles.serviceList}>
            {data.services.map((s) => (
              <button key={s.id} className={styles.serviceRow} onClick={() => pickService(s.id)}>
                <div>
                  <div className={styles.serviceName}>{s.name}</div>
                  <div className={styles.serviceMeta}>
                    {formatPrice(s.priceCents) && (
                      <span className={styles.servicePrice}>{formatPrice(s.priceCents)}</span>
                    )}
                    <span>{s.durationMinutes} min</span>
                  </div>
                </div>
                <span className={styles.agendarBtn}>Agendar</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 2. Profissional + data + horários (uma tela) */}
      {step === 'schedule' && service && (
        <section>
          <button className={styles.back} onClick={() => setStep('service')}>
            ← {service.name}
          </button>

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
            {days.map((d) => (
              <button
                key={d.iso}
                className={styles.dateChip}
                onClick={() => {
                  manualDate.current = true;
                  setDate(d.iso);
                  setSlot(null);
                }}
              >
                <span className={styles.dateWeekday}>{d.weekday}</span>
                <span className={`${styles.dateNum} ${date === d.iso ? styles.dateNumActive : ''}`}>
                  {d.day}
                </span>
              </button>
            ))}
          </div>

          <h2 className={styles.stepTitle}>Horários disponíveis</h2>
          {loading && <p className={styles.hint}>Procurando horários…</p>}
          {!loading && displaySlots.length === 0 && (
            <p className={styles.hint}>Sem horários nesse dia — toque em outro dia acima ☝️</p>
          )}

          {!loading && manha.length > 0 && (
            <SlotSection label="Manhã" slots={manha} onPick={(s) => { setSlot(s); setStep('details'); }} active={slot} />
          )}
          {!loading && tarde.length > 0 && (
            <SlotSection label="Tarde" slots={tarde} onPick={(s) => { setSlot(s); setStep('details'); }} active={slot} />
          )}
        </section>
      )}

      {/* 3. Dados */}
      {step === 'details' && service && slot && (
        <section>
          <button className={styles.back} onClick={() => setStep('schedule')}>
            ← Voltar
          </button>
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
