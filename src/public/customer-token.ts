import { createHmac, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Credencial do cliente final para ver e cancelar os próprios agendamentos.
//
// Existe porque a versão anterior identificava o cliente só pelo telefone
// digitado: qualquer um que soubesse o número de alguém via onde e quando essa
// pessoa ia estar. Rate limit corta a varredura em massa, mas não a consulta
// dirigida — para isso é preciso PROVAR posse, e é o que este token faz: ele é
// entregue no ato do agendamento a quem acabou de agendar, e não pode ser
// adivinhado a partir do telefone.
//
// Não é JWT de propósito. O JWT desta app é a sessão do DONO no painel; usar o
// mesmo formato para o cliente final convida a confundir os dois na hora de
// validar. A chave aqui é DERIVADA do JWT_SECRET (e nunca é o próprio), então
// não há env nova para configurar no deploy e, ainda assim, vazar um token de
// cliente não diz nada sobre a chave que assina a sessão do dono.
// ---------------------------------------------------------------------------

const ROTULO_DA_CHAVE = 'agendai:acesso-do-cliente:v1';
const VALIDADE_EM_DIAS = 180;

export interface AcessoDoCliente {
  businessId: string;
  customerId: string;
}

// A chave de assinatura é HMAC(JWT_SECRET, rótulo). Derivar em vez de reusar
// separa criptograficamente os dois usos: quem tiver esta chave não consegue
// assinar um token de painel, e vice-versa.
function chave(segredoBase: string): Buffer {
  return createHmac('sha256', segredoBase).update(ROTULO_DA_CHAVE).digest();
}

function b64url(b: Buffer): string {
  return b.toString('base64url');
}

function assinar(corpo: string, segredoBase: string): string {
  return b64url(createHmac('sha256', chave(segredoBase)).update(corpo).digest());
}

/** Emite o token de acesso de um cliente a um negócio. */
export function criarTokenDoCliente(
  acesso: AcessoDoCliente,
  segredoBase: string,
  agoraMs = Date.now(),
): string {
  const expiraEm = Math.floor(agoraMs / 1000) + VALIDADE_EM_DIAS * 24 * 60 * 60;
  const corpo = b64url(
    Buffer.from(
      JSON.stringify({ b: acesso.businessId, c: acesso.customerId, e: expiraEm }),
      'utf8',
    ),
  );
  return `${corpo}.${assinar(corpo, segredoBase)}`;
}

/**
 * Lê o token. Devolve null para QUALQUER problema — formato, assinatura ou
 * prazo. O chamador não precisa saber qual: a resposta ao cliente é a mesma, e
 * distinguir só ajudaria quem está testando token forjado.
 */
export function lerTokenDoCliente(
  token: string | undefined,
  segredoBase: string,
  agoraMs = Date.now(),
): AcessoDoCliente | null {
  if (!token) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [corpo, assinaturaRecebida] = partes;

  // timingSafeEqual exige o mesmo tamanho, então compara os buffers crus das
  // duas assinaturas — e só depois de conferir o tamanho, senão ele lança.
  const esperada = Buffer.from(assinar(corpo, segredoBase), 'utf8');
  const recebida = Buffer.from(assinaturaRecebida, 'utf8');
  if (esperada.length !== recebida.length) return null;
  if (!timingSafeEqual(esperada, recebida)) return null;

  try {
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as {
      b?: unknown;
      c?: unknown;
      e?: unknown;
    };
    if (typeof dados.b !== 'string' || typeof dados.c !== 'string') return null;
    if (typeof dados.e !== 'number') return null;
    if (dados.e * 1000 <= agoraMs) return null;
    return { businessId: dados.b, customerId: dados.c };
  } catch {
    return null;
  }
}
