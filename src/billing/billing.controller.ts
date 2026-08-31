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
import { StripeService } from './stripe.service';

// Assinatura do painel. Tudo protegido por JWT e escopado pelo businessId do
// token (multi-tenant). NENHUMA cobrança acontece aqui — as leituras
// alimentam as telas e o confirm é o gancho do checkout (ver abaixo).
import { EscolherPlanoDto } from './billing.dto';
@Controller('me')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private billing: BillingService,
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
   * Assina/troca o plano escolhido. Sem assinatura viva ainda: devolve a URL
   * da Checkout Session do Stripe (front redireciona via window.location.href).
   * Já com assinatura ativa: troca o plano na mesma subscription (sem novo
   * checkout) e devolve `{ switched: true }` — o webhook (POST /webhook/stripe)
   * é quem sincroniza o `plan` no banco nos dois casos.
   */
  @Post('billing/checkout-session')
  async createCheckoutSession(
    @CurrentBusiness() businessId: string,
    @CurrentOwner() owner: AuthenticatedOwner,
    @Body() body: EscolherPlanoDto,
  ) {
    return this.stripe.subscribe({
      businessId,
      planId: body.planId,
      ownerEmail: owner.email,
    });
  }

  /**
   * Abre o Portal de Cobrança do Stripe (atualizar cartão, ver faturas,
   * cancelar). Só faz sentido pra quem já assinou — o StripeService valida.
   */
  @Post('billing/portal')
  async createBillingPortal(@CurrentBusiness() businessId: string) {
    const url = await this.stripe.createPortalSessionUrl(businessId);
    return { url };
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
    @Body() body: EscolherPlanoDto,
  ) {
    if (
      process.env.ENABLE_DEV_BILLING !== '1' ||
      process.env.NODE_ENV === 'production'
    ) {
      throw new ForbiddenException(
        'Assinatura ainda não disponível por este atalho: use o checkout (Stripe).',
      );
    }
    return this.billing.confirmSubscription(businessId, body.planId);
  }
}
