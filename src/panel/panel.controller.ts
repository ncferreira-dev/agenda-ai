import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
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

  /** Atualiza dados e branding do negócio (tela "Aparência"). */
  @Patch('business')
  updateBusiness(
    @CurrentBusiness() businessId: string,
    @Body()
    body: {
      name?: string;
      accentColor?: string;
      about?: string;
      instagramUrl?: string;
      logoUrl?: string;
      coverUrl?: string;
      requireDeposit?: boolean;
      depositCents?: number | null;
    },
  ) {
    return this.panel.updateBusiness(businessId, body);
  }

  /** Agendamentos do meu negócio. Filtra por janela (from/to) e status. */
  @Get('appointments')
  appointments(
    @CurrentBusiness() businessId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.panel.getAppointments(businessId, { from, to, status });
  }

  /** Cancela um agendamento do meu negócio. */
  @Patch('appointments/:id/cancel')
  cancel(@CurrentBusiness() businessId: string, @Param('id') id: string) {
    return this.panel.cancel(businessId, id);
  }
}
