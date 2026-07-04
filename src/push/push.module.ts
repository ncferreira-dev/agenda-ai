import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PushService } from './push.service';
import { PushController } from './push.controller';

// Web Push do dono. Exporta o PushService pra NotificationsModule disparar o aviso
// de novo agendamento. Importa AuthModule pelo guard/decorators do painel.
@Module({
  imports: [AuthModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
