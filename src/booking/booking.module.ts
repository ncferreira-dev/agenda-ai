import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { MessagingModule } from '../whatsapp/messaging.module';
import { MailModule } from '../mail/mail.module';
import { BookingService } from './booking.service';

@Module({
  imports: [PaymentsModule, MessagingModule, MailModule],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
