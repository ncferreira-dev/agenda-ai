import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PanelModule } from './panel/panel.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingModule } from './booking/booking.module';
import { AgentModule } from './agent/agent.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { PublicModule } from './public/public.module';
import { ReminderModule } from './reminder/reminder.module';

@Module({
  imports: [
    // ScheduleModule.forRoot() habilita o cron do ReminderService.
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    PanelModule,
    AvailabilityModule,
    BookingModule,
    AgentModule,
    WhatsAppModule,
    PublicModule,
    ReminderModule,
  ],
})
export class AppModule {}
