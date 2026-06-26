import { Module } from '@nestjs/common';
import { MessagingModule } from '../whatsapp/messaging.module';
import { ReminderService } from './reminder.service';

@Module({
  imports: [MessagingModule],
  providers: [ReminderService],
})
export class ReminderModule {}
