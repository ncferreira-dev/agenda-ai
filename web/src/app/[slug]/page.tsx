import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { getBusinessPage } from '@/lib/api';
import { BookingFlow } from './BookingFlow';
import styles from './booking.module.css';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pago?: string; pagamento?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

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

  return (
    <main className={styles.page} style={accentStyle} data-skin={business.themePreset ?? undefined}>
      {business.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.cover} src={business.coverUrl} alt="" />
      ) : (
        <div className={styles.heroGradient} />
      )}

      <header className={styles.header}>
        {business.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.logo} src={business.logoUrl} alt={business.name} />
        )}
        <h1 className={styles.businessName}>{business.name}</h1>
        <p className={styles.tagline}>Agende seu horário</p>

        {business.address && (
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

        {business.about && <p className={styles.about}>{business.about}</p>}

        {business.instagramUrl && (
          <a
            className={styles.instagram}
            href={business.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Instagram ↗
          </a>
        )}
      </header>

      <div className={styles.trust}>
        <div className={styles.trustItem}>
          <svg className={styles.trustIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
          </svg>
          <span className={styles.trustLabel}>Confirmação na hora</span>
        </div>
        <div className={styles.trustItem}>
          <svg className={styles.trustIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          <span className={styles.trustLabel}>Lembrete no WhatsApp</span>
        </div>
        <div className={styles.trustItem}>
          <svg className={styles.trustIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className={styles.trustLabel}>Sem cadastro</span>
        </div>
      </div>

      {sp.pago === '1' && (
        <div className={`${styles.banner} ${styles.bannerOk}`}>
          Pagamento recebido! Seu horário está confirmado. ✓
        </div>
      )}
      {sp.pagamento === 'cancelado' && (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          Pagamento não concluído. O horário não foi reservado, pode tentar de novo.
        </div>
      )}

      <BookingFlow slug={slug} data={data} />

      <footer className={styles.footer}>
        feito com <span className={styles.brand}>agend.ai</span>
      </footer>
    </main>
  );
}
