import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BillingGateGuard } from '../../billing/billing-gate.guard';
import { CurrentBusiness } from '../../auth/decorators/current-business.decorator';
import { ProfessionalsService } from './professionals.service';

import { CriarProfissionalDto, AtualizarProfissionalDto, DefinirFaixasDto } from './professionals.dto';
@Controller('me/professionals')
@UseGuards(JwtAuthGuard, BillingGateGuard)
export class ProfessionalsController {
  constructor(private professionals: ProfessionalsService) {}

  @Get()
  list(@CurrentBusiness() businessId: string) {
    return this.professionals.list(businessId);
  }

  @Post()
  create(@CurrentBusiness() businessId: string, @Body() body: CriarProfissionalDto) {
    return this.professionals.create(businessId, body);
  }

  @Patch(':id')
  update(
    @CurrentBusiness() businessId: string,
    @Param('id') id: string,
    @Body() body: AtualizarProfissionalDto,
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
    @Body() body: DefinirFaixasDto,
  ) {
    return this.professionals.setWorkingHours(businessId, id, body?.faixas);
  }
}
