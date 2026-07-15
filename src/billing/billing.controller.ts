import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentBusiness,
  CurrentOwner,
} from '../auth/decorators/current-business.decorator';
import type { AuthenticatedOwner } from '../auth/auth.service';
import { BillingService } from './billing.service';
import { ReferralService } from './referral.service';
import { StripeService } from './stripe.service';

// Assinatura + indicação do painel. Tudo protegido por JWT e escopado pelo
// businessId do token (multi-tenant). NENHUMA cobrança acontece aqui — as
// leituras alimentam as telas e o confirm é o gancho do checkout (ver abaixo).
@Controller('me')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private billing: BillingService,
    private referral: ReferralService,
    private stripe: StripeService,
  ) {}

  /** Estado do plano atual pra aba "Meu plano". */
  @Get('plan')
  getPlan(@CurrentBusiness() businessId: string) {
    return this.billing.getMyPlan(businessId);
  }

  /** Orçamento de um plano (promessa de preço + descontos) pra confirmação. */
  @Get('plan/quote')
  getQuote(
    @CurrentBusiness() businessId: string,
    @Query('planId') planId: string,
  ) {
    return this.billing.getQuote(businessId, planId);
  }

  /**
   * Abre o checkout do Stripe pro plano escolhido. Devolve a URL da Checkout
   * Session — o front só redireciona (window.location.href). Quem ativa a
   * assinatura de verdade é o webhook (POST /webhook/stripe), não este
   * endpoint: aqui só se abre a cobrança.
   */
  @Post('billing/checkout-session')
  async createCheckoutSession(
    @CurrentBusiness() businessId: string,
    @CurrentOwner() owner: AuthenticatedOwner,
    @Body('planId') planId: string,
  ) {
    const url = await this.stripe.createCheckoutSessionUrl({
      businessId,
      planId,
      ownerEmail: owner.email,
    });
    return { url };
  }

  /** Números da tela de indicações. */
  @Get('referrals')
  getReferrals(@CurrentBusiness() businessId: string) {
    return this.referral.getStats(businessId);
  }

  /**
   * Ativa a assinatura sem cobrar — só pra QA manual das telas. Trava dupla
   * de propósito: ENABLE_DEV_BILLING=1 E NODE_ENV !== "production", pra nunca
   * ligar em produção mesmo que a env seja setada por engano num deploy. Com
   * o checkout Stripe (POST /me/billing/checkout-session + webhook, que chama
   * BillingService.confirmSubscription de verdade), prefira sempre testar
   * pelo Checkout em modo TESTE — este endpoint é só um atalho de dev.
   */
  @Post('plan/confirm')
  confirm(
    @CurrentBusiness() businessId: string,
    @Body('planId') planId: string,
  ) {
    if (
      process.env.ENABLE_DEV_BILLING !== '1' ||
      process.env.NODE_ENV === 'production'
    ) {
      throw new ForbiddenException(
        'Assinatura ainda não disponível por este atalho: use o checkout (Stripe).',
      );
    }
    return this.billing.confirmSubscription(businessId, planId);
  }
}
