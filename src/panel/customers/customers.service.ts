import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { renderFollowUpMessage } from '../../follow-up/render-message';
import { aggregateCustomerStats, segmentOf, EMPTY_STATS } from './customers.utils';

// CRM: lista, ficha e observação privada do dono sobre o cliente.
// Todo método recebe businessId como 1º argumento e filtra por ele — o
// businessId vem do JWT, nunca do corpo da requisição.
//
// Nasceu do PanelService, que tinha 1028 linhas e cinco assuntos dentro.
@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
  ) {}

  /**
   * Lista os clientes do negócio já com os números de CRM: total gasto (pagos),
   * nº de visitas (COMPLETED), última visita e segmento. Agrega tudo em memória
   * a partir de uma única varredura dos agendamentos do negócio.
   */
  async listCustomers(businessId: string) {
    const [business, customers, appts] = await Promise.all([
      this.prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { inactiveDays: true, vipMinSpentCents: true, recurringMinVisits: true },
      }),
      this.prisma.customer.findMany({
        where: { businessId },
        select: { id: true, name: true, phone: true, email: true, ownerNote: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.appointment.findMany({
        where: { businessId, status: { not: 'CANCELLED' } },
        select: { customerId: true, status: true, totalCents: true, manualPaidAt: true, startAt: true },
      }),
    ]);

    const stats = aggregateCustomerStats(appts);
    const now = new Date();

    return customers.map((c) => {
      const s = stats.get(c.id) ?? EMPTY_STATS;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        ownerNote: c.ownerNote,
        totalAppointments: s.total,
        visits: s.visits,
        totalSpentCents: s.spentCents,
        lastAt: s.lastVisitAt?.toISOString() ?? null,
        segment: segmentOf(business, s, now),
      };
    });
  }

  /**
   * Ficha completa de um cliente (CRM). Agregados financeiros + segmento +
   * serviços mais feitos + histórico + mensagem de retorno pronta pro WhatsApp.
   * Escopado por businessId (o cliente tem de ser do negócio do dono).
   */
  async getCustomerDetail(businessId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId },
      select: { id: true, name: true, phone: true, email: true, ownerNote: true, createdAt: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado.');

    const [business, appts] = await Promise.all([
      this.prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { name: true, inactiveDays: true, vipMinSpentCents: true, recurringMinVisits: true },
      }),
      this.prisma.appointment.findMany({
        where: { businessId, customerId, status: { not: 'CANCELLED' } },
        orderBy: { startAt: 'desc' },
        select: {
          id: true,
          startAt: true,
          status: true,
          totalCents: true,
          manualPaidAt: true,
          service: { select: { name: true, followUpMessage: true } },
          professional: { select: { name: true } },
          items: { select: { name: true, priceCents: true }, orderBy: { createdAt: 'asc' } },
        },
      }),
    ]);

    const now = new Date();
    const s = aggregateCustomerStats(
      appts.map((a) => ({ customerId, status: a.status, totalCents: a.totalCents, manualPaidAt: a.manualPaidAt, startAt: a.startAt })),
    ).get(customerId) ?? EMPTY_STATS;

    // Serviços mais feitos: conta os itens dos atendimentos CONCLUÍDOS.
    const svc = new Map<string, number>();
    for (const a of appts) {
      if (a.status !== 'COMPLETED') continue;
      for (const it of a.items) svc.set(it.name, (svc.get(it.name) ?? 0) + 1);
    }
    const topServices = [...svc.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, 5);

    // Mensagem de retorno pronta (mesmo render do follow-up). Usa o serviço do
    // atendimento mais recente como {servico}; cai no template padrão se não houver.
    const lastService = appts[0]?.service;
    const whatsappMessage = renderFollowUpMessage(
      lastService?.followUpMessage ?? null,
      customer.name,
      lastService?.name ?? 'seu atendimento',
      business.name,
    );

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      ownerNote: customer.ownerNote,
      createdAt: customer.createdAt.toISOString(),
      totalSpentCents: s.spentCents,
      paidCount: s.paidCount,
      visits: s.visits,
      avgTicketCents: s.paidCount > 0 ? Math.round(s.spentCents / s.paidCount) : 0,
      firstVisitAt: s.firstVisitAt?.toISOString() ?? null,
      lastVisitAt: s.lastVisitAt?.toISOString() ?? null,
      segment: segmentOf(business, s, now),
      topServices,
      whatsappMessage,
      history: appts.map((a) => ({
        id: a.id,
        startAt: a.startAt.toISOString(),
        status: a.status,
        paid: a.manualPaidAt !== null,
        totalCents: a.totalCents,
        service: a.service.name,
        professional: a.professional.name,
        items: a.items,
      })),
    };
  }

  /** Salva a observação privada do dono sobre um cliente (scoped por negócio). */
  async updateCustomerNote(businessId: string, customerId: string, note: string) {
    const found = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Cliente não encontrado.');
    const trimmed = note.trim();
    if (trimmed.length > 500) throw new BadRequestException('Observação muito longa (máx. 500).');
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { ownerNote: trimmed || null },
      select: { id: true, ownerNote: true },
    });
  }
}
