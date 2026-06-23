import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentBusiness } from '../../auth/decorators/current-business.decorator';
import {
  ProfessionalsService,
  type ProfessionalInput,
  type WorkingHourInput,
} from './professionals.service';

@Controller('me/professionals')
@UseGuards(JwtAuthGuard)
export class ProfessionalsController {
  constructor(private professionals: ProfessionalsService) {}

  @Get()
  list(@CurrentBusiness() businessId: string) {
    return this.professionals.list(businessId);
  }

  @Post()
  create(@CurrentBusiness() businessId: string, @Body() body: ProfessionalInput) {
    return this.professionals.create(businessId, body);
  }

  @Patch(':id')
  update(
    @CurrentBusiness() businessId: string,
    @Param('id') id: string,
    @Body() body: Partial<ProfessionalInput> & { active?: boolean },
  ) {
    return this.professionals.update(businessId, id, body);
  }

  @Delete(':id')
  remove(@CurrentBusiness() businessId: string, @Param('id') id: string) {
    return this.professionals.remove(businessId, id);
  }

  @Get(':id/working-hours')
  getWorkingHours(@CurrentBusiness() businessId: string, @Param('id') id: string) {
    return this.professionals.getWorkingHours(businessId, id);
  }

  @Put(':id/working-hours')
  setWorkingHours(
    @CurrentBusiness() businessId: string,
    @Param('id') id: string,
    @Body() body: { faixas: WorkingHourInput[] },
  ) {
    return this.professionals.setWorkingHours(businessId, id, body?.faixas);
  }
}
