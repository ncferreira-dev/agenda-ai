import { Module } from '@nestjs/common';
import { CloudApiProvider } from './whatsapp.provider';

// Só o provider de envio, sem depender do agente/booking — assim Booking,
// Reminder e WhatsApp podem enviar mensagens sem ciclo de dependência.
@Module({
  providers: [CloudApiProvider],
  exports: [CloudApiProvider],
})
export class MessagingModule {}
