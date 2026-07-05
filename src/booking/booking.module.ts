import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BookingService } from './booking.service';

@Module({
  imports: [MailModule, NotificationsModule],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
