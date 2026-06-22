import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingModule } from '../booking/booking.module';
import { PublicBookingController } from './public-booking.controller';

// Superfície pública do cliente final. Tenant resolvido por slug na URL,
// sem login (regra de ouro 5).
@Module({
  imports: [AvailabilityModule, BookingModule],
  controllers: [PublicBookingController],
})
export class PublicModule {}
