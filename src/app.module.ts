import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { BillingModule } from './billing/billing.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // ScheduleModule.forRoot() habilita o cron do ReminderService.
    ScheduleModule.forRoot(),
    // Rate limit por IP. Mora AQUI, e não no AuthModule, porque é preocupação
    // da aplicação inteira: quem registra no módulo de login faz o limite das
    // rotas públicas depender de um import que ninguém lembra de manter.
    // O módulo é @Global(), então basta este forRoot para o ThrottlerGuard
    // funcionar em qualquer controller.
    //
    // NÃO há guard global de propósito: o limite vale só onde está declarado
    // com @UseGuards(ThrottlerGuard), para o painel autenticado (que faz muitas
    // chamadas legítimas em sequência) não cair na cota do visitante anônimo.
    // Este valor é só o piso de quem usa o guard sem declarar @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    HealthModule,
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
    BillingModule,
  ],
})
export class AppModule {}
