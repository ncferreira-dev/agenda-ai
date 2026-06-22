// Raiz do frontend público. O produto real abre numa rota de negócio:
// /barbearia-do-ze (o slug). Esta página é só um atalho em dev.
export default function Home() {
  return (
    <main style={{ maxWidth: 480, margin: '80px auto', padding: '0 24px' }}>
      <h1>Agenda WhatsApp</h1>
      <p>Página pública de agendamento. Abra a agenda de um negócio pelo slug:</p>
      <p>
        <a href="/barbearia-do-ze" style={{ color: 'var(--accent)' }}>
          /barbearia-do-ze
        </a>
      </p>
    </main>
  );
}
