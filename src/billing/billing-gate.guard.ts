import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedOwner } from '../auth/auth.service';

// ---------------------------------------------------------------------------
// Bloqueia o painel quando a assinatura não está em dia. À PROVA DE BURLA: é
// um guard de backend, não uma flag de UI — ninguém destranca trocando algo
// no DevTools ou chamando a API direto.
//
// Uso: @UseGuards(JwtAuthGuard, BillingGateGuard) — nesta ordem, no MESMO
// array, em cada controller do painel que deve ficar bloqueado. Explícito por
// controller de propósito (mesmo padrão do JwtAuthGuard hoje: nada de guard
// global "mágico"). O BillingController (telas /painel/planos, /meu-plano)
// fica de fora — é onde o dono reativa a assinatura, não pode travar também.
//
// Roda DEPOIS do JwtAuthGuard (mesmo array) — precisa de req.user.businessId
// já populado pelo JwtStrategy.
// ---------------------------------------------------------------------------
@Injectable()
export class BillingGateGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedOwner }>();

    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: req.user.businessId },
      select: { subscriptionStatus: true, trialEndsAt: true },
    });

    // PAST_DUE NÃO bloqueia (o Stripe já está tentando cobrar de novo; o
    // front mostra só um banner). Só CANCELED e trial vencido travam de verdade.
    const trialExpired =
      business.subscriptionStatus === 'TRIALING' &&
      business.trialEndsAt !== null &&
      business.trialEndsAt < new Date();
    const locked = business.subscriptionStatus === 'CANCELED' || trialExpired;

    if (locked) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Assinatura necessária pra continuar usando o painel.',
      });
    }

    return true;
  }
}
