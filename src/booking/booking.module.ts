import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { MessagingModule } from '../whatsapp/messaging.module';
import { BookingService } from './booking.service';

@Module({
  imports: [PaymentsModule, MessagingModule],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
