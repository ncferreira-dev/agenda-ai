import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { BookingService } from '../booking/booking.service';

// ---------------------------------------------------------------------------
// API pública do cliente final. Tenant resolvido pelo slug na URL.
// Sem autenticação: o cliente é identificado por telefone, não por login.
// ---------------------------------------------------------------------------

interface CreateBookingBody {
  serviceId: string;
  professionalId: string;
  startAt: string; // ISO com offset, exatamente como veio de /availability
  name: string;
  phone: string; // E.164, ex.: 5511999998888
  email?: string;
  notes?: string;
}

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

  /** Próximos agendamentos do cliente (identificado pelo telefone). */
  @Get('appointments')
  async myAppointments(@Param('slug') slug: string, @Query('phone') phone?: string) {
    if (!phone) throw new BadRequestException('Informe o telefone.');
    const business = await this.resolveBusiness(slug);
    const customer = await this.prisma.customer.findUnique({
      where: { businessId_phone: { businessId: business.id, phone: this.normalizePhone(phone) } },
    });
    if (!customer) return [];
    const appts = await this.booking.getUpcomingForCustomer(business.id, customer.id);
    return appts.map((a) => ({
      id: a.id,
      service: a.service.name,
      professional: a.professional.name,
      startAt: a.startAt.toISOString(),
      status: a.status,
    }));
  }

  /** Cancela um agendamento do próprio cliente (confere telefone + negócio). */
  @Patch('appointments/:id/cancel')
  async cancelMine(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: { phone: string },
  ) {
    if (!body?.phone) throw new BadRequestException('Informe o telefone.');
    const business = await this.resolveBusiness(slug);
    const customer = await this.prisma.customer.findUnique({
      where: { businessId_phone: { businessId: business.id, phone: this.normalizePhone(body.phone) } },
    });
    const appt = customer
      ? await this.prisma.appointment.findFirst({
          where: { id, businessId: business.id, customerId: customer.id },
          select: { id: true },
        })
      : null;
    if (!appt) throw new NotFoundException('Agendamento não encontrado.');
    await this.booking.cancelAppointment(business.id, id);
    return { id, cancelled: true };
  }

  /** Dados pra renderizar a página: negócio + serviços + profissionais. */
  @Get()
  async getBusinessPage(@Param('slug') slug: string) {
    const business = await this.resolveBusiness(slug);

    const services = await this.prisma.service.findMany({
      where: { businessId: business.id, active: true },
      select: { id: true, name: true, durationMinutes: true, priceCents: true },
      orderBy: { name: 'asc' },
    });

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
        closedWeekdays,
        // Branding (Nível 1) — a página pública usa pra vestir a marca.
        logoUrl: business.logoUrl,
        coverUrl: business.coverUrl,
        accentColor: business.accentColor,
        about: business.about,
        instagramUrl: business.instagramUrl,
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
  @Get('availability')
  async getAvailability(
    @Param('slug') slug: string,
    @Query('serviceId') serviceId: string,
    @Query('date') date: string,
    @Query('professionalId') professionalId?: string,
  ) {
    if (!serviceId || !date) {
      throw new BadRequestException('serviceId e date são obrigatórios.');
    }
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
  @Post('bookings')
  async createBooking(@Param('slug') slug: string, @Body() body: CreateBookingBody) {
    const { serviceId, professionalId, startAt, name, phone, email, notes } = body;
    if (!serviceId || !professionalId || !startAt || !phone) {
      throw new BadRequestException('Faltam dados pra agendar.');
    }
    const business = await this.resolveBusiness(slug);

    // Normaliza no servidor (não confia no formato do cliente) — telefone em E.164.
    const customer = await this.booking.findOrCreateCustomer(
      business.id,
      this.normalizePhone(phone),
      name,
      email?.trim() || undefined,
    );
    const { appointment: appt, checkoutUrl } = await this.booking.createAppointment({
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
      paymentStatus: appt.paymentStatus,
      // Se exige sinal, o front redireciona pra cá pra pagar e confirmar.
      checkoutUrl: checkoutUrl ?? null,
    };
  }
}
