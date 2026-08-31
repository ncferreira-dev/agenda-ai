import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BillingGateGuard } from '../../billing/billing-gate.guard';
import { CurrentBusiness } from '../../auth/decorators/current-business.decorator';
import { ServicesService } from './services.service';

import { CriarServicoDto, AtualizarServicoDto } from './services.dto';
@Controller('me/services')
@UseGuards(JwtAuthGuard, BillingGateGuard)
export class ServicesController {
  constructor(private services: ServicesService) {}

  @Get()
  list(@CurrentBusiness() businessId: string) {
    return this.services.list(businessId);
  }

  @Post()
  create(@CurrentBusiness() businessId: string, @Body() body: CriarServicoDto) {
    return this.services.create(businessId, body);
  }

  @Patch(':id')
  update(
    @CurrentBusiness() businessId: string,
    @Param('id') id: string,
    @Body() body: AtualizarServicoDto,
  ) {
    return this.services.update(businessId, id, body);
  }

  @Delete(':id')
  remove(@CurrentBusiness() businessId: string, @Param('id') id: string) {
    return this.services.remove(businessId, id);
  }
}
