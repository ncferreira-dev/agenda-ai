import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Normalizações e validações de campo do painel, em função pura.
//
// Eram métodos privados de um service de 1028 linhas. Lançar BadRequestException
// daqui não impede o teste: a exceção é só um objeto, e é justamente a mensagem
// que o dono lê na tela — testar a regra sem testar a mensagem deixaria de fora
// metade do que importa.
// ---------------------------------------------------------------------------

/** Hex #RRGGBB, em maiúsculas. Vazio limpa (null). */
export function normalizeColor(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
    throw new BadRequestException('Cor inválida. Use hex no formato #RRGGBB.');
  }
  return v.toUpperCase();
}

/** Inteiro dentro da faixa, ou 400 dizendo qual campo e qual faixa. */
export function requireRange(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new BadRequestException(`Valor de ${label} deve ser um inteiro entre ${min} e ${max}.`);
  }
  return value;
}

/** E-mail simples, em minúsculas. Vazio limpa (null). */
export function normalizeEmail(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    throw new BadRequestException('E-mail inválido.');
  }
  return v;
}

/** URL http(s). Vazio limpa (null). */
export function normalizeUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^https?:\/\//.test(v)) {
    throw new BadRequestException('URL inválida (precisa começar com http).');
  }
  return v;
}

/**
 * Só dígitos, sempre com DDI 55 na frente. Vazio limpa (null).
 *
 * O `label` entra na mensagem porque a MESMA regra vale para três campos
 * diferentes (telefone do dono, WhatsApp de avisos e WhatsApp do negócio):
 * "Telefone inválido." sozinho não diz qual deles a pessoa precisa arrumar.
 * Mesmo motivo do `label` de requireRange, logo acima.
 */
export function normalizePhone(value: string, label = 'Telefone'): string | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 10 || digits.length > 13) {
    throw new BadRequestException(`${label} inválido. Use DDD + número (ex.: 11 91234-5678).`);
  }
  return digits.startsWith('55') ? digits : `55${digits}`;
}

/** Oito dígitos. Vazio limpa (null). */
export function normalizeCep(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length !== 8) throw new BadRequestException('CEP deve ter 8 dígitos.');
  return digits;
}

/**
 * Filtro de status da agenda. Sem status informado, a lista traz tudo MENOS
 * cancelado — é a agenda de trabalho do dono, e cancelado ali só faria ruído.
 */
export function parseStatus(status?: string): Prisma.EnumAppointmentStatusFilter {
  if (!status) {
    return {
      in: [
        AppointmentStatus.PENDING,
        AppointmentStatus.CONFIRMED,
        AppointmentStatus.COMPLETED,
        AppointmentStatus.NO_SHOW,
      ],
    };
  }
  if (!(status in AppointmentStatus)) {
    throw new BadRequestException(`status inválido: ${status}`);
  }
  return { equals: status as AppointmentStatus };
}
