import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentBusiness } from '../../auth/decorators/current-business.decorator';
import { ServicesService, type ServiceInput } from './services.service';
import { SuggestionService } from '../../suggestion/suggestion.service';

@Controller('me/services')
@UseGuards(JwtAuthGuard)
export class ServicesController {
  constructor(
    private services: ServicesService,
    private suggestion: SuggestionService,
  ) {}

  @Get()
  list(@CurrentBusiness() businessId: string) {
    return this.services.list(businessId);
  }

  // Sugere intervalo + mensagem de follow-up a partir do que o dono descreve.
  // businessId vem do JWT só para garantir que é um dono logado (multi-tenant).
  @Post('suggest-followup')
  suggestFollowUp(
    @CurrentBusiness() _businessId: string,
    @Body() body: { description?: string; profession?: string },
  ) {
    return this.suggestion.suggestFollowUp({
      description: body?.description ?? '',
      profession: body?.profession ?? null,
    });
  }

  @Post()
  create(@CurrentBusiness() businessId: string, @Body() body: ServiceInput) {
    return this.services.create(businessId, body);
  }

  @Patch(':id')
  update(
    @CurrentBusiness() businessId: string,
    @Param('id') id: string,
    @Body() body: Partial<ServiceInput> & { active?: boolean },
  ) {
    return this.services.update(businessId, id, body);
  }

  @Delete(':id')
  remove(@CurrentBusiness() businessId: string, @Param('id') id: string) {
    return this.services.remove(businessId, id);
  }
}
