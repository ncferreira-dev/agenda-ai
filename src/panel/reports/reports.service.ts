import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';

// Relatórios de faturamento, por período e por profissional.
// Todo método recebe businessId como 1º argumento e filtra por ele — o
// businessId vem do JWT, nunca do corpo da requisição.
//
// Nasceu do PanelService, que tinha 1028 linhas e cinco assuntos dentro.
@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
  ) {}

  /**
   * Relatório de faturamento num período [from, to), em TRÊS baldes usando o
   * total EDITADO (Appointment.totalCents):
   *   - Recebido: pago (manualPaidAt != null)
   *   - A receber: não pago já atendido (COMPLETED ou no passado), exceto NO_SHOW
   *   - Previsto: não pago, futuro e CONFIRMED
   * NO_SHOW não pago e PENDING (aguardando sinal) não entram em balde nenhum.
   * Breakdowns por serviço/profissional somam o totalCents dos não-cancelados.
   */
  async getRevenueReport(businessId: string, from: Date, to: Date) {
    const appts = await this.prisma.appointment.findMany({
      where: {
        businessId,
        status: { not: 'CANCELLED' },
        startAt: { gte: from, lt: to },
      },
      select: {
        startAt: true,
        status: true,
        totalCents: true,
        manualPaidAt: true,
        service: { select: { name: true } },
        professional: { select: { name: true } },
      },
    });

    const now = new Date();
    const bucket = { previsto: { cents: 0, count: 0 }, aReceber: { cents: 0, count: 0 }, recebido: { cents: 0, count: 0 } };
    const byService = new Map<string, { count: number; cents: number }>();
    const byProfessional = new Map<string, { count: number; cents: number }>();
    const bump = (m: Map<string, { count: number; cents: number }>, key: string, cents: number) => {
      const cur = m.get(key) ?? { count: 0, cents: 0 };
      cur.count += 1;
      cur.cents += cents;
      m.set(key, cur);
    };

    for (const a of appts) {
      const cents = a.totalCents;
      if (a.manualPaidAt) {
        bucket.recebido.cents += cents;
        bucket.recebido.count += 1;
      } else if (a.status === 'NO_SHOW') {
        // faltou e não pagou: não há dinheiro a esperar — fora dos baldes.
      } else if (a.status === 'COMPLETED' || a.startAt < now) {
        bucket.aReceber.cents += cents;
        bucket.aReceber.count += 1;
      } else if (a.status === 'CONFIRMED') {
        bucket.previsto.cents += cents;
        bucket.previsto.count += 1;
      }
      // PENDING futuro (aguardando sinal) cai aqui e fica fora dos baldes.

      // Breakdowns: tudo que não é cancelado, exceto faltas (sem valor real).
      if (a.status !== 'NO_SHOW') {
        bump(byService, a.service.name, cents);
        bump(byProfessional, a.professional.name, cents);
      }
    }

    const toList = (m: Map<string, { count: number; cents: number }>) =>
      [...m.entries()]
        .map(([name, v]) => ({ name, count: v.count, cents: v.cents }))
        .sort((a, b) => b.cents - a.cents);

    return {
      previstoCents: bucket.previsto.cents,
      previstoCount: bucket.previsto.count,
      aReceberCents: bucket.aReceber.cents,
      aReceberCount: bucket.aReceber.count,
      recebidoCents: bucket.recebido.cents,
      recebidoCount: bucket.recebido.count,
      byService: toList(byService),
      byProfessional: toList(byProfessional),
    };
  }

  /**
   * Relatório de FATURAMENTO por profissional num período [from, to).
   * Conta só atendimentos REALIZADOS: status COMPLETED OU pago à mão
   * (manualPaidAt != null); NO_SHOW nunca entra.
   * Faturamento = Appointment.totalCents (valor final/editado do atendimento).
   * Também apura tempo trabalhado (soma das durações) e dias distintos no fuso
   * do negócio. Filtrável por professionalId (opcional). Escopado por businessId.
   */
  async getProfessionalRevenueReport(
    businessId: string,
    from: Date,
    to: Date,
    professionalId?: string,
  ) {
    // Fuso do negócio pra apurar "dias trabalhados" na data local, não em UTC.
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    const tz = business?.timezone ?? 'America/Sao_Paulo';

    const appts = await this.prisma.appointment.findMany({
      where: {
        businessId,
        ...(professionalId ? { professionalId } : {}),
        startAt: { gte: from, lt: to },
        // Realizado = concluído ou pago; falta (NO_SHOW) não fatura. CANCELLED
        // também não: cancelar só troca o status e deixa o manualPaidAt intacto,
        // então um agendamento pago e depois cancelado continuava entrando no
        // faturamento por profissional (o relatório geral já exclui CANCELLED).
        OR: [{ status: 'COMPLETED' }, { manualPaidAt: { not: null } }],
        NOT: { status: { in: ['NO_SHOW', 'CANCELLED'] } },
      },
      select: {
        startAt: true,
        endAt: true,
        totalCents: true,
        professional: {
          select: { id: true, name: true },
        },
      },
    });

    type Acc = {
      name: string;
      count: number;
      generatedCents: number;
      workedMinutes: number;
      days: Set<string>; // datas locais distintas (YYYY-MM-DD no fuso do negócio)
    };
    const byPro = new Map<string, Acc>();
    const allDays = new Set<string>(); // dias trabalhados do negócio (p/ o total)

    for (const a of appts) {
      const pro = a.professional;
      const cur =
        byPro.get(pro.id) ?? {
          name: pro.name,
          count: 0,
          generatedCents: 0,
          workedMinutes: 0,
          days: new Set<string>(),
        };
      const minutes = Math.max(0, Math.round((a.endAt.getTime() - a.startAt.getTime()) / 60_000));
      const dayKey = DateTime.fromJSDate(a.startAt, { zone: tz }).toISODate() ?? '';
      cur.count += 1;
      cur.generatedCents += a.totalCents;
      cur.workedMinutes += minutes;
      cur.days.add(dayKey);
      byPro.set(pro.id, cur);
      allDays.add(dayKey);
    }

    const professionals = [...byPro.entries()]
      .map(([id, v]) => ({
        professionalId: id,
        name: v.name,
        count: v.count,
        generatedCents: v.generatedCents,
        workedMinutes: v.workedMinutes,
        daysWorked: v.days.size,
      }))
      .sort((a, b) => b.generatedCents - a.generatedCents);

    return {
      professionals,
      totalCount: professionals.reduce((s, p) => s + p.count, 0),
      totalGeneratedCents: professionals.reduce((s, p) => s + p.generatedCents, 0),
      totalWorkedMinutes: professionals.reduce((s, p) => s + p.workedMinutes, 0),
      totalDaysWorked: allDays.size,
    };
  }
}
