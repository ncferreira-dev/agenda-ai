import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { NotificationsService } from '../notifications/notifications.service';

// ---------------------------------------------------------------------------
// Webhook do Stripe. Dirigido pelo ESTADO da subscription (customer.subscription.*),
// não por cada fatura — mais robusto: cobre 1ª ativação, renovação mensal,
// falha de cobrança e cancelamento com o mesmo handler. Todo evento carrega
// businessId/planId no metadata da subscription (gravado no checkout,
// ver StripeService.createCheckoutSessionUrl), então nunca dependemos de
// client_reference_id (que só existe no checkout.session.completed).
//
// Dedupe: mesmo padrão do webhook do WhatsApp (ver whatsapp.controller.ts),
// só que marca como processado DEPOIS de processar com sucesso — se o
// processamento falhar, a exceção sobe (Nest responde != 2xx), o Stripe
// reenvia, e como o processamento é idempotente (upserts de estado),
// reprocessar é seguro.
// ---------------------------------------------------------------------------
@Controller('webhook/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private prisma: PrismaService,
    private billing: BillingService,
    private stripeService: StripeService,
    private notifications: NotificationsService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Corpo bruto ausente — confira rawBody em main.ts.');
    }
    const event = this.stripeService.constructEvent(req.rawBody, signature);

    const already = await this.prisma.processedStripeEvent.findUnique({
      where: { eventId: event.id },
      select: { eventId: true },
    });
    if (already) return { received: true };

    await this.handle(event);

    // Marca como processado só depois do sucesso acima (ver nota de dedupe).
    await this.prisma.processedStripeEvent
      .create({ data: { eventId: event.id } })
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
        throw err;
      });

    return { received: true };
  }

  private async handle(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.onSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await this.onPaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        // checkout.session.completed inclusive: tudo que importa pra
        // ativar/renovar/cancelar já vem em customer.subscription.* (que
        // carrega businessId/planId no metadata) — nada a fazer aqui.
        break;
    }
  }

  private async onSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
    const businessId = sub.metadata?.businessId;
    if (!businessId) {
      this.logger.warn(`Subscription ${sub.id} sem businessId no metadata — ignorando.`);
      return;
    }
    const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    // current_period_end vive no item da subscription (não mais na subscription
    // em si) nesta versão da API — só vendemos 1 item por assinatura.
    const periodEnd = sub.items.data[0]?.current_period_end;
    if (periodEnd === undefined) {
      this.logger.warn(`Subscription ${sub.id} sem items — não dá pra saber current_period_end.`);
      return;
    }
    const currentPeriodEndsAt = new Date(periodEnd * 1000);

    switch (sub.status) {
      case 'active': {
        const planId = sub.metadata?.planId;
        if (!planId) {
          this.logger.warn(`Subscription ${sub.id} ativa sem planId no metadata — ignorando.`);
          return;
        }
        await this.billing.syncActiveFromStripe({
          businessId,
          planId,
          currentPeriodEndsAt,
          stripeCustomerId,
          stripeSubscriptionId: sub.id,
        });
        break;
      }
      case 'past_due':
        await this.billing.markPastDue(businessId);
        break;
      case 'canceled':
      case 'unpaid':
        await this.billing.markCanceled(businessId);
        break;
      default:
        // incomplete/incomplete_expired/trialing: não usamos trial nativo do
        // Stripe nesta integração — não deveriam aparecer aqui.
        break;
    }
  }

  private async onSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
    const businessId = sub.metadata?.businessId;
    if (!businessId) return;
    await this.billing.markCanceled(businessId);
  }

  private async onPaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    // Nesta versão da API, a subscription da fatura vive em
    // parent.subscription_details.subscription (não mais invoice.subscription).
    const subRef = invoice.parent?.subscription_details?.subscription;
    const subscriptionId = typeof subRef === 'string' ? subRef : subRef?.id;
    if (!subscriptionId) return;

    // Busca pelo nosso banco (não pelo Stripe de novo) — mais barato e evita
    // depender do metadata da invoice, que não carrega businessId.
    const business = await this.prisma.business.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      select: { id: true },
    });
    if (!business) return;

    await this.notifications.notifyPaymentFailed(business.id);
  }
}
