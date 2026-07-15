import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingGateGuard } from '../billing/billing-gate.guard';
import { CurrentBusiness, CurrentOwner } from '../auth/decorators/current-business.decorator';
import type { AuthenticatedOwner } from '../auth/auth.service';
import { PanelService } from './panel.service';

// Painel do dono. Tudo aqui é protegido por JWT e escopado pelo businessId do
// token — o cliente nunca passa businessId. (CRUD completo é a Fase 2.)
//
// BillingGateGuard é aplicado MÉTODO A MÉTODO aqui (não na classe) com UMA
// exceção de propósito: `me()` (GET /me, quem sou eu + meu negócio) fica de
// fora do gate porque o layout do painel (web/.../painel/(app)/layout.tsx)
// chama esse endpoint em TODA página, inclusive nas 3 telas de billing que
// devem continuar acessíveis (planos/meu-plano/indicacoes) — se `me()`
// travasse, o layout confundiria "bloqueado" com "sessão inválida" e
// redirecionaria pro login, quebrando justamente as telas que deveriam
// continuar abertas.
@Controller('me')
@UseGuards(JwtAuthGuard)
export class PanelController {
  constructor(private panel: PanelService) {}

  /** Quem sou eu + meu negócio. FORA do BillingGateGuard — ver nota acima. */
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
  @UseGuards(BillingGateGuard)
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

  /** Define (conta social) ou troca a senha do dono. */
  @Patch('password')
  @UseGuards(BillingGateGuard)
  setPassword(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    return this.panel.setPassword(owner.ownerId, body);
  }

  /** Atualiza dados e branding do negócio (tela "Aparência"). */
  @Patch('business')
  @UseGuards(BillingGateGuard)
  updateBusiness(
    @CurrentBusiness() businessId: string,
    @Body()
    body: {
      name?: string;
      slug?: string;
      accentColor?: string;
      about?: string;
      instagramUrl?: string;
      profession?: string;
      themePreset?: string;
      logoUrl?: string;
      coverUrl?: string;
      notifyWhatsApp?: boolean;
      notifyEmail?: boolean;
      notifyPush?: boolean;
      notifyOwnerAllBookings?: boolean;
      notifyDailySummary?: boolean;
      ownerWhatsApp?: string;
      ownerEmail?: string;
      phone?: string;
      address?: string;
      serviceMode?: string;
      meetingUrl?: string;
      timezone?: string;
      slotStepMinutes?: number;
      minLeadMinutes?: number;
      maxAdvanceDays?: number;
      reminderHoursBefore?: number;
      inactiveDays?: number;
      vipMinSpentCents?: number | null;
      recurringMinVisits?: number;
    },
  ) {
    return this.panel.updateBusiness(businessId, body);
  }

  // --- Onboarding "qual é o seu negócio?" (Fase 3b) ----------------------

  /** Catálogo de verticais + peles pro wizard de onboarding. */
  @Get('verticais')
  @UseGuards(BillingGateGuard)
  verticais() {
    return this.panel.getVerticais();
  }

  /** Aplica um vertical: cor/tema sugeridos + serviços-base. */
  @Post('onboarding/apply')
  @UseGuards(BillingGateGuard)
  applyVertical(
    @CurrentBusiness() businessId: string,
    @Body() body: { vertical?: string; skin?: string },
  ) {
    if (!body?.vertical) throw new BadRequestException('Escolha um tipo de negócio.');
    return this.panel.applyVertical(businessId, body.vertical, body.skin);
  }

  /** Conclui (ou pula) o onboarding. */
  @Post('onboarding/finish')
  @UseGuards(BillingGateGuard)
  finishOnboarding(@CurrentBusiness() businessId: string) {
    return this.panel.finishOnboarding(businessId);
  }

  /** Agendamentos do meu negócio. Filtra por janela (from/to) e status. */
  @Get('appointments')
  @UseGuards(BillingGateGuard)
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
  @UseGuards(BillingGateGuard)
  cancel(@CurrentBusiness() businessId: string, @Param('id') id: string) {
    return this.panel.cancel(businessId, id);
  }

  /**
   * Marca a PRESENÇA do atendimento: COMPLETED (compareceu), NO_SHOW (faltou)
   * ou CONFIRMED (desfaz a marcação, volta ao estado ativo).
   */
  @Patch('appointments/:id/status')
  @UseGuards(BillingGateGuard)
  setStatus(
    @CurrentBusiness() businessId: string,
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    if (
      body?.status !== 'COMPLETED' &&
      body?.status !== 'NO_SHOW' &&
      body?.status !== 'CONFIRMED'
    ) {
      throw new BadRequestException('status deve ser COMPLETED, NO_SHOW ou CONFIRMED.');
    }
    return this.panel.setAppointmentStatus(businessId, id, body.status);
  }

  /** Marca/desmarca o pagamento manual do atendimento. */
  @Patch('appointments/:id/paid')
  @UseGuards(BillingGateGuard)
  setPaid(
    @CurrentBusiness() businessId: string,
    @Param('id') id: string,
    @Body() body: { paid?: boolean },
  ) {
    return this.panel.setAppointmentPaid(businessId, id, Boolean(body?.paid));
  }

  /** Substitui os itens cobrados (serviço principal + extras) e recalcula o total. */
  @Patch('appointments/:id/items')
  @UseGuards(BillingGateGuard)
  setItems(
    @CurrentBusiness() businessId: string,
    @Param('id') id: string,
    @Body() body: { items?: Array<{ name?: string; priceCents?: number; sourceServiceId?: string | null }> },
  ) {
    if (!Array.isArray(body?.items)) {
      throw new BadRequestException('items deve ser uma lista.');
    }
    return this.panel.setAppointmentItems(businessId, id, body.items);
  }

  /** Lista de clientes do negócio (com números de CRM). */
  @Get('customers')
  @UseGuards(BillingGateGuard)
  customers(@CurrentBusiness() businessId: string) {
    return this.panel.listCustomers(businessId);
  }

  /** Ficha completa (CRM) de um cliente do negócio. */
  @Get('customers/:id')
  @UseGuards(BillingGateGuard)
  customerDetail(@CurrentBusiness() businessId: string, @Param('id') id: string) {
    return this.panel.getCustomerDetail(businessId, id);
  }

  /** Salva a observação privada sobre um cliente. */
  @Patch('customers/:id')
  @UseGuards(BillingGateGuard)
  updateCustomer(
    @CurrentBusiness() businessId: string,
    @Param('id') id: string,
    @Body() body: { note?: string },
  ) {
    return this.panel.updateCustomerNote(businessId, id, body?.note ?? '');
  }

  /** Relatório de faturamento num período (ISO de/até). */
  @Get('report')
  @UseGuards(BillingGateGuard)
  report(
    @CurrentBusiness() businessId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const f = new Date(from);
    const t = new Date(to);
    if (isNaN(f.getTime()) || isNaN(t.getTime())) {
      throw new BadRequestException('Período inválido (use ISO em from/to).');
    }
    return this.panel.getRevenueReport(businessId, f, t);
  }

  /** Faturamento por profissional num período (ISO de/até). */
  @Get('report/by-professional')
  @UseGuards(BillingGateGuard)
  byProfessional(
    @CurrentBusiness() businessId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('professionalId') professionalId?: string,
  ) {
    const f = new Date(from);
    const t = new Date(to);
    if (isNaN(f.getTime()) || isNaN(t.getTime())) {
      throw new BadRequestException('Período inválido (use ISO em from/to).');
    }
    return this.panel.getProfessionalRevenueReport(businessId, f, t, professionalId || undefined);
  }
}
