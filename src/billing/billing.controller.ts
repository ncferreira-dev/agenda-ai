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
import { CurrentBusiness } from '../auth/decorators/current-business.decorator';
import { BillingService } from './billing.service';
import { ReferralService } from './referral.service';

// Assinatura + indicação do painel. Tudo protegido por JWT e escopado pelo
// businessId do token (multi-tenant). NENHUMA cobrança acontece aqui — as
// leituras alimentam as telas e o confirm é o gancho do checkout (ver abaixo).
@Controller('me')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private billing: BillingService,
    private referral: ReferralService,
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

  /** Números da tela de indicações. */
  @Get('referrals')
  getReferrals(@CurrentBusiness() businessId: string) {
    return this.referral.getStats(businessId);
  }

  /**
   * Ativa a assinatura (grava datas + realiza os benefícios de indicação).
   *
   * GANCHO DO CHECKOUT: enquanto o Mercado Pago não existe, este endpoint só
   * responde se ENABLE_DEV_BILLING=1 (pra dar pra testar as telas sem cobrar).
   * Quando o checkout entrar, o WEBHOOK de pagamento aprovado chama
   * BillingService.confirmSubscription direto — e este endpoint dev sai de cena.
   */
  @Post('plan/confirm')
  confirm(
    @CurrentBusiness() businessId: string,
    @Body('planId') planId: string,
  ) {
    if (process.env.ENABLE_DEV_BILLING !== '1') {
      throw new ForbiddenException(
        'Assinatura ainda não disponível: o checkout (Mercado Pago) não está ligado.',
      );
    }
    return this.billing.confirmSubscription(businessId, planId);
  }
}
