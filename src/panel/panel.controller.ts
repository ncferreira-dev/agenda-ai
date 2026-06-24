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
    const [profile, business] = await Promise.all([
      this.panel.getOwner(owner.ownerId),
      this.panel.getBusiness(businessId),
    ]);
    return { owner: profile, business };
  }

  /** Atualiza o perfil do dono (nome, telefone, CPF, CEP, foto). */
  @Patch('profile')
  updateProfile(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Body()
    body: {
      name?: string;
      phone?: string;
      cpf?: string;
      cep?: string;
      photoUrl?: string;
    },
  ) {
    return this.panel.updateOwner(owner.ownerId, body);
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
      phone?: string;
      timezone?: string;
      slotStepMinutes?: number;
      minLeadMinutes?: number;
      maxAdvanceDays?: number;
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
