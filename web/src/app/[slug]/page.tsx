import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { getBusinessPage } from '@/lib/api';
import { BookingFlow } from './BookingFlow';
import { CoverImage, LogoAvatar } from './BrandImage';
import styles from './booking.module.css';

// Link do WhatsApp do negócio. SEMPRE api.whatsapp.com/send (nunca wa.me: o
// wa.me quebra emojis no destinatário). Devolve null se não houver telefone.
function whatsappHref(phone: string | null, businessName: string): string | null {
  let d = (phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return null;
  if (!(d.startsWith('55') && d.length >= 12)) d = `55${d}`;
  const msg = `Olá! Vim pela página de agendamento da ${businessName}.`;
  return `https://api.whatsapp.com/send?phone=${d}&text=${encodeURIComponent(msg)}`;
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let data;
  try {
    data = await getBusinessPage(slug);
  } catch {
    notFound();
  }

  const { business } = data;

  // Injeta a cor do negócio como --accent (sobrescreve o padrão do CSS).
  const accentStyle = business.accentColor
    ? ({ ['--accent']: business.accentColor } as CSSProperties)
    : undefined;

  // Contatos que viram botão no rodapé da página.
  const waLink = whatsappHref(business.phone, business.name);
  const mapsLink =
    business.serviceMode !== 'REMOTO' && business.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address)}`
      : null;

  return (
    <div className={styles.pageOuter}>
      <main className={styles.page} style={accentStyle} data-skin={business.themePreset ?? undefined}>
        <CoverImage src={business.coverUrl} />

        <header className={styles.header}>
          <LogoAvatar src={business.logoUrl} name={business.name} />
          <h1 className={styles.businessName}>{business.name}</h1>

          {business.serviceMode !== 'REMOTO' && business.address && (
            <a
              className={styles.address}
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {business.address}
            </a>
          )}

          {business.serviceMode !== 'PRESENCIAL' &&
            (business.meetingUrl ? (
              <a className={styles.address} href={business.meetingUrl} target="_blank" rel="noopener noreferrer">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 7l-7 5 7 5V7z" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                Atendimento online
              </a>
            ) : (
              <span className={styles.address}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 7l-7 5 7 5V7z" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                Atendimento online
              </span>
            ))}

          {business.about && <p className={styles.about}>{business.about}</p>}
        </header>

        <div className={styles.trust}>
          <div className={styles.trustItem}>
            <svg className={styles.trustIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
            </svg>
            <span className={styles.trustLabel}>Confirmação na hora</span>
          </div>
          <div className={styles.trustItem}>
            <svg className={styles.trustIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            <span className={styles.trustLabel}>Confirmação por e-mail</span>
          </div>
          <div className={styles.trustItem}>
            <svg className={styles.trustIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className={styles.trustLabel}>Sem cadastro</span>
          </div>
        </div>

        <BookingFlow slug={slug} data={data} />

        {/* Contato do negócio: WhatsApp, Instagram e como chegar. */}
        {(waLink || business.instagramUrl || mapsLink) && (
          <div className={styles.contactRow}>
            {waLink && (
              <a className={styles.contactBtn} href={waLink} target="_blank" rel="noopener noreferrer">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                WhatsApp
              </a>
            )}
            {business.instagramUrl && (
              <a className={styles.contactBtn} href={business.instagramUrl} target="_blank" rel="noopener noreferrer">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
                Instagram
              </a>
            )}
            {mapsLink && (
              <a className={styles.contactBtn} href={mapsLink} target="_blank" rel="noopener noreferrer">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Como chegar
              </a>
            )}
          </div>
        )}

        <footer className={styles.footer}>
          feito com <span className={styles.brand}>agend.ai</span>
        </footer>
      </main>
    </div>
  );
}
