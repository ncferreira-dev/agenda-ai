import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  NotFoundException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { BookingService } from '../booking/booking.service';
import { effectivePriceCents } from '../pricing/service-price';
import { criarTokenDoCliente, lerTokenDoCliente } from './customer-token';
import {
  CriarAgendamentoDto,
  CancelarAgendamentoDto,
  ConsultarAgendamentosDto,
  ConsultarDisponibilidadeDto,
} from './public-booking.dto';
import { requireJwtSecret } from '../auth/jwt-secret';

// ---------------------------------------------------------------------------
// API pública do cliente final. Tenant resolvido pelo slug na URL.
// Sem autenticação: o cliente é identificado por telefone, não por login.
// ---------------------------------------------------------------------------

// Toda rota daqui é anônima e alcançável por qualquer um na internet, então o
// guard de rate limit vale para o controller inteiro: rota nova nasce protegida
// pelo piso do AppModule (60/min por IP) mesmo que quem escreveu esqueça de
// declarar um limite. Quem precisa de mais folga ou de mais aperto declara o
// próprio @Throttle abaixo.
@UseGuards(ThrottlerGuard)
@Controller('b/:slug')
export class PublicBookingController {
  constructor(
    private prisma: PrismaService,
    private availability: AvailabilityService,
    private booking: BookingService,
  ) {}

  private async resolveBusiness(slug: string) {
    const business = await this.prisma.business.findUnique({ where: { slug } });
    if (!business) throw new NotFoundException('Estabelecimento não encontrado.');
    return business;
  }

  private normalizePhone(raw: string): string {
    const d = (raw ?? '').replace(/\D/g, '');
    return d.startsWith('55') ? d : `55${d}`;
  }

  /**
   * Próximos agendamentos do cliente, identificado pelo token que ele recebeu ao
   * agendar. NÃO aceita telefone: identificar por número digitado entregava a
   * agenda de qualquer pessoa a quem soubesse o número dela.
   */
  @Throttle({ default: { limit: 30, ttl: 10 * 60_000 } })
  @Get('appointments')
  async myAppointments(@Param('slug') slug: string, @Query() query: ConsultarAgendamentosDto) {
    const business = await this.resolveBusiness(slug);
    const acesso = lerTokenDoCliente(query.token, requireJwtSecret());
    // O token carrega o negócio de origem: um token do salão A não pode listar
    // nada no salão B, mesmo sendo uma assinatura válida.
    if (!acesso || acesso.businessId !== business.id) {
      throw new UnauthorizedException('Link inválido ou expirado.');
    }
    const appts = await this.booking.getUpcomingForCustomer(business.id, acesso.customerId);
    return appts.map((a) => ({
      id: a.id,
      service: a.service.name,
      professional: a.professional.name,
      startAt: a.startAt.toISOString(),
      status: a.status,
    }));
  }

  /** Cancela um agendamento do próprio cliente (confere token + negócio). */
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @Patch('appointments/:id/cancel')
  async cancelMine(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: CancelarAgendamentoDto,
  ) {
    const business = await this.resolveBusiness(slug);
    const acesso = lerTokenDoCliente(body.token, requireJwtSecret());
    if (!acesso || acesso.businessId !== business.id) {
      throw new UnauthorizedException('Link inválido ou expirado.');
    }
    // Só cancela o que ainda é cancelável: do próprio cliente, PENDING/CONFIRMED
    // e no futuro. Sem o filtro de status/tempo dava pra "cancelar" um
    // agendamento já COMPLETED (e pago) ou passado — o que só servia pra tirá-lo
    // do faturamento do dono depois do serviço feito.
    const appt = await this.prisma.appointment.findFirst({
      where: {
        id,
        businessId: business.id,
        customerId: acesso.customerId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startAt: { gte: new Date() },
      },
      select: { id: true },
    });
    if (!appt) throw new NotFoundException('Agendamento não encontrado ou não pode mais ser cancelado.');
    await this.booking.cancelAppointment(business.id, id);
    return { id, cancelled: true };
  }

  /** Dados pra renderizar a página: negócio + serviços + profissionais. */
  @Get()
  async getBusinessPage(@Param('slug') slug: string) {
    const business = await this.resolveBusiness(slug);

    const rawServices = await this.prisma.service.findMany({
      where: { businessId: business.id, active: true },
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        priceCents: true,
        discountKind: true,
        discountValue: true,
        isKit: true,
        kitItems: {
          select: { member: { select: { name: true } } },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    // priceCents = preço cheio; finalPriceCents = com desconto (helper puro).
    // Kits expõem os serviços inclusos pra página listar o que vem no pacote.
    const services = rawServices.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      priceCents: s.priceCents,
      finalPriceCents: effectivePriceCents(s),
      discountKind: s.discountKind,
      isKit: s.isKit,
      includes: s.isKit ? s.kitItems.map((k) => k.member.name) : [],
    }));

    const professionals = await this.prisma.professional.findMany({
      where: { businessId: business.id, active: true },
      select: {
        id: true,
        name: true,
        photoUrl: true, // público; phone/cpf NÃO são expostos
        services: { select: { serviceId: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Dias da semana totalmente fechados: aquele em que um bloqueio recorrente do
    // NEGÓCIO INTEIRO (professionalId null) cobre todo o expediente de todos os
    // profissionais ativos. A página pública marca esses dias como "Fechado".
    const closedWeekdays = await this.computeClosedWeekdays(
      business.id,
      professionals.map((p) => p.id),
    );

    return {
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        timezone: business.timezone,
        maxAdvanceDays: business.maxAdvanceDays,
        address: business.address,
        // WhatsApp do negócio — vira botão de contato na página pública.
        phone: business.phone,
        serviceMode: business.serviceMode,
        meetingUrl: business.meetingUrl,
        closedWeekdays,
        // Branding (Nível 1) — a página pública usa pra vestir a marca.
        logoUrl: business.logoUrl,
        coverUrl: business.coverUrl,
        accentColor: business.accentColor,
        about: business.about,
        instagramUrl: business.instagramUrl,
        themePreset: business.themePreset,
      },
      services,
      professionals: professionals.map((p) => ({
        id: p.id,
        name: p.name,
        photoUrl: p.photoUrl,
        serviceIds: p.services.map((s) => s.serviceId),
      })),
    };
  }

  /**
   * Quais dias da semana (0=domingo … 6=sábado) estão totalmente fechados por
   * bloqueio recorrente do negócio inteiro. Um dia é "fechado" quando há expediente
   * mas TODA faixa de trabalho (de todos os profissionais ativos) está coberta por
   * bloqueios recorrentes sem profissional (professionalId null). Dias sem expediente
   * NÃO entram aqui (não é um fechamento por bloqueio, e o engine já os deixa vazios).
   */
  private async computeClosedWeekdays(
    businessId: string,
    professionalIds: string[],
  ): Promise<number[]> {
    if (professionalIds.length === 0) return [];

    const [workingHours, businessBlocks] = await Promise.all([
      this.prisma.workingHour.findMany({
        where: { professionalId: { in: professionalIds } },
        select: { weekday: true, startMinute: true, endMinute: true },
      }),
      this.prisma.recurringBlock.findMany({
        where: { businessId, professionalId: null },
        select: { weekday: true, startMinute: true, endMinute: true },
      }),
    ]);

    const closed: number[] = [];
    for (let wd = 0; wd < 7; wd++) {
      const work = workingHours.filter((w) => w.weekday === wd);
      if (work.length === 0) continue; // sem expediente nesse dia: não é "fechado por bloqueio"

      // Une os bloqueios do dia (intervalos que se tocam viram um só).
      const merged: Array<[number, number]> = [];
      const intervals = businessBlocks
        .filter((b) => b.weekday === wd)
        .map((b) => [b.startMinute, b.endMinute] as [number, number])
        .sort((a, b) => a[0] - b[0]);
      for (const [s, e] of intervals) {
        const last = merged[merged.length - 1];
        if (last && s <= last[1]) last[1] = Math.max(last[1], e);
        else merged.push([s, e]);
      }

      // Fechado se toda faixa de trabalho cabe dentro de um bloqueio unido.
      const allCovered = work.every((w) =>
        merged.some(([bs, be]) => bs <= w.startMinute && be >= w.endMinute),
      );
      if (allCovered) closed.push(wd);
    }
    return closed;
  }

  /** Horários livres de um serviço numa data. */
  // Folga maior: é a rota que a tela chama a cada troca de dia, serviço ou
  // profissional, então o piso de 60/min pecaria contra o cliente legítimo.
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('availability')
  async getAvailability(
    @Param('slug') slug: string,
    @Query() query: ConsultarDisponibilidadeDto,
  ) {
    const { serviceId, date, professionalId } = query;
    const business = await this.resolveBusiness(slug);
    const avail = await this.availability.getAvailability({
      businessId: business.id,
      serviceId,
      date,
      professionalId,
    });
    return avail.map((a) => ({
      professionalId: a.professionalId,
      professionalName: a.professionalName,
      slots: a.slots.map((s) => ({ startAt: s.startAt.toISOString(), label: s.label })),
    }));
  }

  /** Cria o agendamento. */
  // Escrita: 15 por hora por IP. Uma família agendando do mesmo Wi-Fi cabe;
  // encher a agenda do dono com horários falsos, não.
  @Throttle({ default: { limit: 15, ttl: 60 * 60_000 } })
  @Post('bookings')
  async createBooking(@Param('slug') slug: string, @Body() body: CriarAgendamentoDto) {
    const { serviceId, professionalId, startAt, name, phone, email, notes } = body;
    const business = await this.resolveBusiness(slug);

    // Normaliza no servidor (não confia no formato do cliente) — telefone em E.164.
    const customer = await this.booking.findOrCreateCustomer(
      business.id,
      this.normalizePhone(phone),
      name,
      email?.trim() || undefined,
    );
    const { appointment: appt } = await this.booking.createAppointment({
      businessId: business.id,
      customerId: customer.id,
      professionalId,
      serviceId,
      startAtIso: startAt,
      notes,
    });

    return {
      id: appt.id,
      service: appt.service.name,
      professional: appt.professional.name,
      startAt: appt.startAt.toISOString(),
      // Credencial de quem acabou de agendar: é com ela que a tela "Meus
      // agendamentos" funciona depois, sem pedir telefone nenhum.
      accessToken: criarTokenDoCliente(
        { businessId: business.id, customerId: customer.id },
        requireJwtSecret(),
      ),
    };
  }
}
