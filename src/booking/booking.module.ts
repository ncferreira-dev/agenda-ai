import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BookingService } from './booking.service';

@Module({
  imports: [PaymentsModule, MailModule, NotificationsModule],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
