import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StripeService } from './stripe.service';
import { PaymentsController } from './payments.controller';
import { PaymentsReleaseService } from './payments-release.service';

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController],
  providers: [StripeService, PaymentsReleaseService],
  exports: [StripeService],
})
export class PaymentsModule {}
