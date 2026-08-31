import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AtualizarPerfilDto,
  TrocarSenhaDto,
  AtualizarNegocioDto,
  AplicarVerticalDto,
  StatusDoAtendimentoDto,
  PagamentoDoAtendimentoDto,
  ItensDoAtendimentoDto,
  ObservacaoDoClienteDto,
} from './panel.dto';
import { BillingGateGuard } from '../billing/billing-gate.guard';
import { CurrentBusiness, CurrentOwner } from '../auth/decorators/current-business.decorator';
import type { AuthenticatedOwner } from '../auth/auth.service';
import { BusinessService } from './business/business.service';
import { OwnerService } from './owner/owner.service';
import { AppointmentsService } from './appointments/appointments.service';
import { CustomersService } from './customers/customers.service';
import { ReportsService } from './reports/reports.service';

// Painel do dono. Tudo aqui é protegido por JWT e escopado pelo businessId do
// token — o cliente nunca passa businessId. (CRUD completo é a Fase 2.)
//
// BillingGateGuard é aplicado MÉTODO A MÉTODO aqui (não na classe) com UMA
// exceção de propósito: `me()` (GET /me, quem sou eu + meu negócio) fica de
// fora do gate porque o layout do painel (web/.../painel/(app)/layout.tsx)
// chama esse endpoint em TODA página, inclusive nas telas de billing que
// devem continuar acessíveis (planos/meu-plano) — se `me()` travasse, o
// layout confundiria "bloqueado" com "sessão inválida" e redirecionaria pro
// login, quebrando justamente as telas que deveriam continuar abertas.
@Controller('me')
@UseGuards(JwtAuthGuard)
export class PanelController {
  // Cinco dependências em vez de uma, e isso é o ponto: era um PanelService de
  // 1028 linhas com cinco assuntos dentro. Quem mexer em relatório agora abre
  // 169 linhas de relatório, e não o arquivo inteiro.
  constructor(
    private negocio: BusinessService,
    private dono: OwnerService,
    private agenda: AppointmentsService,
    private clientes: CustomersService,
    private relatorios: ReportsService,
  ) {}

  /** Quem sou eu + meu negócio. FORA do BillingGateGuard — ver nota acima. */
  @Get()
  async me(
    @CurrentOwner() owner: AuthenticatedOwner,
    @CurrentBusiness() businessId: string,
  ) {
    const [profile, business] = await Promise.all([
      this.dono.getOwner(owner.ownerId),
      this.negocio.getBusiness(businessId),
    ]);
    return { owner: profile, business };
  }

  /** Atualiza o perfil do dono (nome, telefone, CPF, CEP, foto). */
  @Patch('profile')
  @UseGuards(BillingGateGuard)
  updateProfile(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Body() body: AtualizarPerfilDto,
  ) {
    return this.dono.updateOwner(owner.ownerId, body);
  }

  /** Define (conta social) ou troca a senha do dono. */
  @Patch('password')
  @UseGuards(BillingGateGuard)
  setPassword(
    @CurrentOwner() owner: AuthenticatedOwner,
    @Body() body: TrocarSenhaDto,
  ) {
    return this.dono.setPassword(owner.ownerId, body);
  }

  /** Atualiza dados e branding do negócio (tela "Aparência"). */
  @Patch('business')
  @UseGuards(BillingGateGuard)
  updateBusiness(
    @CurrentBusiness() businessId: string,
    @Body() body: AtualizarNegocioDto,
  ) {
    return this.negocio.updateBusiness(businessId, body);
  }

  // --- Onboarding "qual é o seu negócio?" (Fase 3b) ----------------------
  //
  // Estes três ficam FORA do BillingGateGuard de propósito (como o me() acima).
  // O layout do painel manda quem não concluiu o onboarding pra /painel/onboarding
  // ANTES de liberar o resto. Se o trial vence com o onboarding ainda pendente e
  // estes endpoints estivessem no gate, dava um loop: a página de onboarding busca
  // /me/verticais -> 403 -> o front redireciona pra /painel/planos -> o layout vê
  // onboarding pendente -> volta pro onboarding -> ... e o dono nunca chega na tela
  // onde pagaria. Sem gate aqui, ele conclui (ou pula) o onboarding e AÍ é levado
  // ao billing normalmente. Onboarding não dá acesso a nenhuma tela paga, então
  // liberá-lo não fura o gate — só destrava o caminho até o pagamento.

  /** Catálogo de verticais + peles pro wizard de onboarding. */
  @Get('verticais')
  verticais() {
    return this.negocio.getVerticais();
  }

  /** Aplica um vertical: cor/tema sugeridos + serviços-base. */
  @Post('onboarding/apply')
  applyVertical(
    @CurrentBusiness() businessId: string,
    @Body() body: AplicarVerticalDto,
  ) {
    return this.negocio.applyVertical(businessId, body.vertical, body.skin);
  }

  /** Conclui (ou pula) o onboarding. */
  @Post('onboarding/finish')
  finishOnboarding(@CurrentBusiness() businessId: string) {
    return this.negocio.finishOnboarding(businessId);
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
    return this.agenda.getAppointments(businessId, { from, to, status });
  }

  /** Cancela um agendamento do meu negócio. */
  @Patch('appointments/:id/cancel')
  @UseGuards(BillingGateGuard)
  cancel(@CurrentBusiness() businessId: string, @Param('id') id: string) {
    return this.agenda.cancel(businessId, id);
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
    @Body() body: StatusDoAtendimentoDto,
  ) {
    return this.agenda.setAppointmentStatus(businessId, id, body.status);
  }

  /** Marca/desmarca o pagamento manual do atendimento. */
  @Patch('appointments/:id/paid')
  @UseGuards(BillingGateGuard)
  setPaid(
    @CurrentBusiness() businessId: string,
    @Param('id') id: string,
    @Body() body: PagamentoDoAtendimentoDto,
  ) {
    return this.agenda.setAppointmentPaid(businessId, id, body.paid);
  }

  /** Substitui os itens cobrados (serviço principal + extras) e recalcula o total. */
  @Patch('appointments/:id/items')
  @UseGuards(BillingGateGuard)
  setItems(
    @CurrentBusiness() businessId: string,
    @Param('id') id: string,
    @Body() body: ItensDoAtendimentoDto,
  ) {
    return this.agenda.setAppointmentItems(businessId, id, body.items);
  }

  /** Lista de clientes do negócio (com números de CRM). */
  @Get('customers')
  @UseGuards(BillingGateGuard)
  customers(@CurrentBusiness() businessId: string) {
    return this.clientes.listCustomers(businessId);
  }

  /** Ficha completa (CRM) de um cliente do negócio. */
  @Get('customers/:id')
  @UseGuards(BillingGateGuard)
  customerDetail(@CurrentBusiness() businessId: string, @Param('id') id: string) {
    return this.clientes.getCustomerDetail(businessId, id);
  }

  /** Salva a observação privada sobre um cliente. */
  @Patch('customers/:id')
  @UseGuards(BillingGateGuard)
  updateCustomer(
    @CurrentBusiness() businessId: string,
    @Param('id') id: string,
    @Body() body: ObservacaoDoClienteDto,
  ) {
    return this.clientes.updateCustomerNote(businessId, id, body.note ?? '');
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
    return this.relatorios.getRevenueReport(businessId, f, t);
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
    return this.relatorios.getProfessionalRevenueReport(businessId, f, t, professionalId || undefined);
  }
}
