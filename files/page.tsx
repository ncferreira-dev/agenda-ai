import { notFound } from 'next/navigation';
import { getBusinessPage } from '@/lib/api';
import { BookingFlow } from './BookingFlow';
import styles from './booking.module.css';

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let data;
  try {
    data = await getBusinessPage(slug);
  } catch {
    notFound();
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.businessName}>{data.business.name}</h1>
        <p className={styles.tagline}>Agende seu horário</p>
      </header>
      <BookingFlow slug={slug} data={data} />
    </main>
  );
}
