import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ReferralStats {
  code: string | null; // código do dono (null só se algo antigo não tiver gerado)
  totalReferrals: number; // quantos se cadastraram pelo link
  convertedReferrals: number; // quantos já assinaram (viraram recompensa)
  pendingReferrals: number; // cadastraram mas ainda não assinaram
  creditCents: number; // crédito acumulado disponível
}

@Injectable()
export class ReferralService {
  constructor(private prisma: PrismaService) {}

  /** Números da tela "Indicações" do dono. Só leitura, escopado por businessId. */
  async getStats(businessId: string): Promise<ReferralStats> {
    const [business, grouped] = await Promise.all([
      this.prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { referralCode: true, referralCreditCents: true },
      }),
      this.prisma.referral.groupBy({
        by: ['status'],
        where: { referrerBusinessId: businessId },
        _count: { _all: true },
      }),
    ]);

    const count = (status: 'PENDING' | 'CONVERTED' | 'EXPIRED') =>
      grouped.find((g) => g.status === status)?._count._all ?? 0;

    const converted = count('CONVERTED');
    const pending = count('PENDING');

    return {
      code: business.referralCode,
      totalReferrals: converted + pending + count('EXPIRED'),
      convertedReferrals: converted,
      pendingReferrals: pending,
      creditCents: business.referralCreditCents,
    };
  }
}
