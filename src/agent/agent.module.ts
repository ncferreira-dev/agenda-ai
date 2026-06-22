import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingModule } from '../booking/booking.module';
import { AgentService } from './agent.service';

@Module({
  imports: [AvailabilityModule, BookingModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
