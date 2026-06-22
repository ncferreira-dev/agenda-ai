import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ReminderService } from './reminder.service';

@Module({
  imports: [WhatsAppModule],
  providers: [ReminderService],
})
export class ReminderModule {}
