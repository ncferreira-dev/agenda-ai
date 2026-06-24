import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { PaymentsController } from './payments.controller';
import { PaymentsReleaseService } from './payments-release.service';

@Module({
  controllers: [PaymentsController],
  providers: [StripeService, PaymentsReleaseService],
  exports: [StripeService],
})
export class PaymentsModule {}
