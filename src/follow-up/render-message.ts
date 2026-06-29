import { DEFAULT_FOLLOWUP_MESSAGE } from '../presets/profissoes';

/**
 * Aplica os placeholders {nome}/{servico}/{negocio} na mensagem de retorno.
 * Usa só o 1º nome do cliente. Compartilhado pelo cron de follow-up e pelo
 * botão "Chamar no WhatsApp" do painel, pra mensagem não divergir.
 */
export function renderFollowUpMessage(
  template: string | null,
  customerName: string | null,
  serviceName: string,
  businessName: string,
): string {
  const firstName = customerName?.trim().split(/\s+/)[0] ?? '';
  return (template ?? DEFAULT_FOLLOWUP_MESSAGE)
    .replaceAll('{nome}', firstName || 'tudo bem')
    .replaceAll('{servico}', serviceName)
    .replaceAll('{negocio}', businessName);
}
