'use client';

import styles from '../../painel.module.css';

// Botão "Chamar" (win-back) por linha da lista de clientes. Abre o WhatsApp do
// DONO já com uma mensagem de retorno pronta pra ele revisar e enviar na mão —
// sem API, sem token, custo zero. Usa api.whatsapp.com/send (NÃO wa.me): o
// wa.me quebra emojis no destinatário (viram "?"), confirmado em produção.
// Só aparece se o cliente tiver telefone.
export function WhatsAppCallButton({
  name,
  phone,
  businessName,
}: {
  name: string | null;
  phone: string;
  businessName: string;
}) {
  // Normalização defensiva (BR): só dígitos, sem zeros à esquerda, prefixa 55
  // se ainda não tiver DDI + tamanho mínimo.
  let d = phone.replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return null; // sem telefone: não renderiza o botão
  if (!(d.startsWith('55') && d.length >= 12)) d = `55${d}`;

  const first = (name ?? '').trim().split(' ')[0];
  const greeting = first ? `Oi, ${first}!` : 'Oi!';
  // Emoji "puro" (sem seletor de variação invisível) pra não quebrar no WhatsApp.
  const msg = `${greeting} Sentimos sua falta aqui na ${businessName} 😊 Que tal marcar um horário? Tô por aqui pra te atender!`;
  const href = `https://api.whatsapp.com/send?phone=${d}&text=${encodeURIComponent(msg)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.waCallBtn}
      title="Chamar no WhatsApp (mensagem de retorno)"
    >
      Chamar
    </a>
  );
}
