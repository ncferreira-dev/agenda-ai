import type { Segment } from '@/lib/panel-api';
import styles from '../../painel.module.css';

// Tag visual do segmento de CRM. Cores reaproveitam os chips do painel.
export function SegmentTag({ segment }: { segment: Segment }) {
  if (segment.kind === 'SUMIDO') {
    return <span className={`${styles.chip} ${styles.chipWarn}`}>Sumido há {segment.inactiveDays}d</span>;
  }
  if (segment.kind === 'VIP') {
    return <span className={`${styles.chip} ${styles.chipOk}`}>★ VIP</span>;
  }
  if (segment.kind === 'RECORRENTE') {
    return <span className={`${styles.chip} ${styles.chipOk}`}>Recorrente</span>;
  }
  return <span className={`${styles.chip} ${styles.chipOff}`}>Novo</span>;
}
