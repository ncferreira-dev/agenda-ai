import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentBusiness, CurrentOwner } from '../auth/decorators/current-business.decorator';
import type { AuthenticatedOwner } from '../auth/auth.service';
import { PanelService } from './panel.service';

// Painel do dono. Tudo aqui é protegido por JWT e escopado pelo businessId do
// token — o cliente nunca passa businessId. (CRUD completo é a Fase 2.)
@Controller('me')
@UseGuards(JwtAuthGuard)
export class PanelController {
  constructor(private panel: PanelService) {}

  /** Quem sou eu + meu negócio. */
  @Get()
  async me(
    @CurrentOwner() owner: AuthenticatedOwner,
    @CurrentBusiness() businessId: string,
  ) {
    const business = await this.panel.getBusiness(businessId);
    return { owner: { id: owner.ownerId, email: owner.email }, business };
  }

  /** Agendamentos do meu negócio. */
  @Get('appointments')
  appointments(@CurrentBusiness() businessId: string) {
    return this.panel.getUpcomingAppointments(businessId);
  }
}
