import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ReferralService } from './referral.service';

// Assinatura e indicação. Importa AuthModule pelo JwtAuthGuard (mesma peça que o
// painel usa). Exporta BillingService pra quando o webhook do Stripe
// precisar chamar confirmSubscription fora daqui.
@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [BillingService, ReferralService],
  exports: [BillingService],
})
export class BillingModule {}
