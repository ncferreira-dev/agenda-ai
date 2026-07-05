import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { PanelModule } from './panel/panel.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingModule } from './booking/booking.module';
import { AgentModule } from './agent/agent.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { PublicModule } from './public/public.module';
import { ReminderModule } from './reminder/reminder.module';
import { FollowUpModule } from './follow-up/follow-up.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PushModule } from './push/push.module';

@Module({
  imports: [
    // ScheduleModule.forRoot() habilita o cron do ReminderService.
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    AuthModule,
    PanelModule,
    AvailabilityModule,
    BookingModule,
    AgentModule,
    WhatsAppModule,
    PublicModule,
    ReminderModule,
    FollowUpModule,
    NotificationsModule,
    PushModule,
  ],
})
export class AppModule {}
