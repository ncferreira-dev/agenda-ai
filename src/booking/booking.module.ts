import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { BookingService } from './booking.service';

@Module({
  imports: [PaymentsModule],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
