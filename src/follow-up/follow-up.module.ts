import { Module } from '@nestjs/common';
import { MessagingModule } from '../whatsapp/messaging.module';
import { FollowUpService } from './follow-up.service';

@Module({
  imports: [MessagingModule],
  providers: [FollowUpService],
})
export class FollowUpModule {}
