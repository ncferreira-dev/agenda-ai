import { Module } from '@nestjs/common';
import { MessagingModule } from '../whatsapp/messaging.module';
import { MailModule } from '../mail/mail.module';
import { PushModule } from '../push/push.module';
import { NotificationsService } from './notifications.service';
import { DailySummaryService } from './daily-summary.service';

// Notificações pro dono (novo agendamento + resumo diário). Não depende de
// Booking nem Payments — por isso os dois podem usá-la sem ciclo de dependência.
@Module({
  imports: [MessagingModule, MailModule, PushModule],
  providers: [NotificationsService, DailySummaryService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
