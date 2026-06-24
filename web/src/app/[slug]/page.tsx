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
    <main className={styles.page} style={accentStyle}>
      {business.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.cover} src={business.coverUrl} alt="" />
      )}

      <header className={styles.header}>
        {business.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.logo} src={business.logoUrl} alt={business.name} />
        )}
        <h1 className={styles.businessName}>{business.name}</h1>
        <p className={styles.tagline}>Agende seu horário</p>

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

      {sp.pago === '1' && (
        <div className={`${styles.banner} ${styles.bannerOk}`}>
          Pagamento recebido! Seu horário está confirmado. ✓
        </div>
      )}
      {sp.pagamento === 'cancelado' && (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          Pagamento não concluído — o horário não foi reservado. Pode tentar de novo.
        </div>
      )}

      <BookingFlow slug={slug} data={data} />

      <footer className={styles.footer}>
        feito com <span className={styles.brand}>agend.ai</span>
      </footer>
    </main>
  );
}
