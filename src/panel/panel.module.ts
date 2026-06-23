import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PanelController } from './panel.controller';
import { PanelService } from './panel.service';

@Module({
  imports: [AuthModule],
  controllers: [PanelController],
  providers: [PanelService],
})
export class PanelModule {}
