import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingModule } from '../booking/booking.module';
import { PanelController } from './panel.controller';
import { PanelService } from './panel.service';
import { ServicesController } from './services/services.controller';
import { ServicesService } from './services/services.service';
import { ProfessionalsController } from './professionals/professionals.controller';
import { ProfessionalsService } from './professionals/professionals.service';
import { BlocksController } from './blocks/blocks.controller';
import { BlocksService } from './blocks/blocks.service';

// Painel do dono: tudo protegido por JWT e escopado pelo businessId do token.
@Module({
  imports: [AuthModule, BookingModule],
  controllers: [PanelController, ServicesController, ProfessionalsController, BlocksController],
  providers: [PanelService, ServicesService, ProfessionalsService, BlocksService],
})
export class PanelModule {}
