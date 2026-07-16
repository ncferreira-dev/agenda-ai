import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingController } from './billing.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';

// Assinatura. Importa AuthModule pelo JwtAuthGuard (mesma peça que o painel
// usa) e NotificationsModule pro webhook avisar o dono quando a cobrança
// falha (invoice.payment_failed). StripeWebhookController não usa
// JwtAuthGuard — é autenticado pela assinatura do Stripe, não por JWT.
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, StripeService],
  exports: [BillingService, StripeService],
})
export class BillingModule {}
