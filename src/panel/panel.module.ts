import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingModule } from '../booking/booking.module';
import { PanelController } from './panel.controller';
import { BusinessService } from './business/business.service';
import { OwnerService } from './owner/owner.service';
import { AppointmentsService } from './appointments/appointments.service';
import { CustomersService } from './customers/customers.service';
import { ReportsService } from './reports/reports.service';
import { ServicesController } from './services/services.controller';
import { ServicesService } from './services/services.service';
import { ProfessionalsController } from './professionals/professionals.controller';
import { ProfessionalsService } from './professionals/professionals.service';
import { BlocksController, RecurringBlocksController } from './blocks/blocks.controller';
import { BlocksService } from './blocks/blocks.service';
import { UploadsController } from './uploads.controller';

// Painel do dono: tudo protegido por JWT e escopado pelo businessId do token.
@Module({
  imports: [AuthModule, BookingModule],
  controllers: [
    PanelController,
    ServicesController,
    ProfessionalsController,
    BlocksController,
    RecurringBlocksController,
    UploadsController,
  ],
  providers: [
    BusinessService,
    OwnerService,
    AppointmentsService,
    CustomersService,
    ReportsService,
    ServicesService,
    ProfessionalsService,
    BlocksService,
  ],
})
export class PanelModule {}
