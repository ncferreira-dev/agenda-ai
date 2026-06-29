import Link from 'next/link';
import { ResetForm } from './ResetForm';
import styles from '../painel.module.css';

// Server component: lê o token da URL e entrega pro form (client).
export default function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams?.token ?? '';

  return (
    <div className={styles.loginWrap}>
      <div className={`${styles.card} ${styles.rise}`}>
        <p className={styles.mark}>agend.ai</p>
        <h1 className={styles.title}>Nova senha</h1>

        {token ? (
          <>
            <p className={styles.subtitle}>Escolha uma nova senha pra sua conta.</p>
            <ResetForm token={token} />
          </>
        ) : (
          <>
            <p className={styles.subtitle}>
              Link inválido. Peça um novo link de redefinição.
            </p>
            <p className={styles.altLink}>
              <Link href="/painel/esqueci-senha">Recuperar senha</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
