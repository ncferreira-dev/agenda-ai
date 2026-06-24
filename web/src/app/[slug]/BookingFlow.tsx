'use client';

import { useState, useMemo } from 'react';
import { getAvailability, createBooking } from '@/lib/api';
import type { BusinessPage, ProfessionalAvailability, BookingResult } from '@/lib/types';
import styles from './booking.module.css';

type Step = 'service' | 'professional' | 'datetime' | 'details' | 'done';

interface DisplaySlot {
  startAt: string;
  label: string;
  professionalId: string;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function nextDays(count: number): { iso: string; weekday: string; day: number; month: string }[] {
  const out = [];
  const base = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ iso, weekday: WEEKDAYS[d.getDay()], day: d.getDate(), month: MONTHS[d.getMonth()] });
  }
  return out;
}

function formatPrice(cents: number): string {
  if (!cents) return '';
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
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

  const service = data.services.find((s) => s.id === serviceId) ?? null;

  // Profissionais que executam o serviço escolhido.
  const eligiblePros = useMemo(
    () => (serviceId ? data.professionals.filter((p) => p.serviceIds.includes(serviceId)) : []),
    [serviceId, data.professionals],
  );

  const days = useMemo(() => nextDays(Math.min(data.business.maxAdvanceDays, 14)), [data]);

  // Junta os horários: se escolheu profissional, só os dele; se "qualquer",
  // unifica e guarda qual profissional cobre cada horário.
  const displaySlots: DisplaySlot[] = useMemo(() => {
    const byLabel = new Map<string, DisplaySlot>();
    for (const pa of availability) {
      for (const s of pa.slots) {
        if (!byLabel.has(s.label)) {
          byLabel.set(s.label, { ...s, professionalId: pa.professionalId });
        }
      }
    }
    return [...byLabel.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [availability]);

  async function pickDate(iso: string) {
    if (!serviceId) return;
    setDate(iso);
    setSlot(null);
    setLoading(true);
    setError(null);
    try {
      const avail = await getAvailability({
        slug,
        serviceId,
        date: iso,
        professionalId: professionalId ?? undefined,
      });
      setAvailability(avail);
    } catch (e: any) {
      setError(e?.message ?? 'Não consegui carregar os horários.');
    } finally {
      setLoading(false);
    }
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
      // Exige sinal: manda pro Checkout do Stripe. Volta em /{slug}?pago=1.
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

  // --- Render por passo ----------------------------------------------------

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
      <Progress step={step} />

      {error && <div className={styles.error}>{error}</div>}

      {step === 'service' && (
        <section>
          <h2 className={styles.stepTitle}>Qual serviço?</h2>
          <div className={styles.list}>
            {data.services.map((s) => (
              <button
                key={s.id}
                className={styles.card}
                onClick={() => {
                  setServiceId(s.id);
                  setProfessionalId(null);
                  setStep('professional');
                }}
              >
                <span className={styles.cardTitle}>{s.name}</span>
                <span className={styles.cardMeta}>
                  {s.durationMinutes} min {formatPrice(s.priceCents) && `· ${formatPrice(s.priceCents)}`}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 'professional' && (
        <section>
          <button className={styles.back} onClick={() => setStep('service')}>← Voltar</button>
          <h2 className={styles.stepTitle}>Com quem?</h2>
          <div className={styles.list}>
            <button
              className={styles.card}
              onClick={() => {
                setProfessionalId(null);
                setStep('datetime');
              }}
            >
              <span className={styles.cardTitle}>Qualquer profissional</span>
              <span className={styles.cardMeta}>primeiro horário disponível</span>
            </button>
            {eligiblePros.map((p) => (
              <button
                key={p.id}
                className={styles.card}
                onClick={() => {
                  setProfessionalId(p.id);
                  setStep('datetime');
                }}
              >
                <span className={styles.cardTitle}>{p.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 'datetime' && (
        <section>
          <button className={styles.back} onClick={() => setStep('professional')}>← Voltar</button>
          <h2 className={styles.stepTitle}>Quando?</h2>
          <div className={styles.dateStrip}>
            {days.map((d) => (
              <button
                key={d.iso}
                className={`${styles.dateChip} ${date === d.iso ? styles.dateChipActive : ''}`}
                onClick={() => pickDate(d.iso)}
              >
                <span className={styles.dateWeekday}>{d.weekday}</span>
                <span className={styles.dateDay}>{d.day}</span>
                <span className={styles.dateMonth}>{d.month}</span>
              </button>
            ))}
          </div>

          {loading && <p className={styles.hint}>Carregando horários…</p>}
          {!loading && date && displaySlots.length === 0 && (
            <p className={styles.hint}>Sem horários nesse dia. Tente outro.</p>
          )}
          <div className={styles.slotGrid}>
            {displaySlots.map((s) => (
              <button
                key={s.startAt}
                className={`${styles.slot} ${slot?.startAt === s.startAt ? styles.slotActive : ''}`}
                onClick={() => {
                  setSlot(s);
                  setStep('details');
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 'details' && service && slot && (
        <section>
          <button className={styles.back} onClick={() => setStep('datetime')}>← Voltar</button>
          <h2 className={styles.stepTitle}>Seus dados</h2>
          <div className={styles.summary}>
            {service.name} · {slot.label}
          </div>
          <label className={styles.label}>
            Nome
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
            />
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

function Progress({ step }: { step: Step }) {
  const order: Step[] = ['service', 'professional', 'datetime', 'details'];
  const current = order.indexOf(step);
  return (
    <div className={styles.progress}>
      {order.map((s, i) => (
        <span
          key={s}
          className={`${styles.progressDot} ${i <= current ? styles.progressDotActive : ''}`}
        />
      ))}
    </div>
  );
}
