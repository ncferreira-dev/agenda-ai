import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { WhatsAppController } from './whatsapp.controller';
import { ConfirmationService } from './confirmation.service';
import { CloudApiProvider } from './whatsapp.provider';

// CloudApiProvider é exportado porque o ReminderService também envia mensagens.
@Module({
  imports: [AgentModule],
  controllers: [WhatsAppController],
  providers: [CloudApiProvider, ConfirmationService],
  exports: [CloudApiProvider],
})
export class WhatsAppModule {}
