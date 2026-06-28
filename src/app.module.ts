import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PanelModule } from './panel/panel.module';
import { PaymentsModule } from './payments/payments.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingModule } from './booking/booking.module';
import { AgentModule } from './agent/agent.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { PublicModule } from './public/public.module';
import { ReminderModule } from './reminder/reminder.module';
import { FollowUpModule } from './follow-up/follow-up.module';

@Module({
  imports: [
    // ScheduleModule.forRoot() habilita o cron do ReminderService.
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    PanelModule,
    PaymentsModule,
    AvailabilityModule,
    BookingModule,
    AgentModule,
    WhatsAppModule,
    PublicModule,
    ReminderModule,
    FollowUpModule,
  ],
})
export class AppModule {}
