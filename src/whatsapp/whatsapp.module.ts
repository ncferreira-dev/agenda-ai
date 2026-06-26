import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { WhatsAppController } from './whatsapp.controller';
import { ConfirmationService } from './confirmation.service';
import { MessagingModule } from './messaging.module';

@Module({
  imports: [AgentModule, MessagingModule],
  controllers: [WhatsAppController],
  providers: [ConfirmationService],
})
export class WhatsAppModule {}
