import type Anthropic from '@anthropic-ai/sdk';
import { DateTime } from 'luxon';
import { AvailabilityService } from '../availability/availability.service';
import { BookingService } from '../booking/booking.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Ferramentas que o agente pode usar. Regra de ouro: o modelo NUNCA cria um
// horário do nada. Ele só lista o que o banco oferece e grava o que foi listado.
// ---------------------------------------------------------------------------

export interface AgentContext {
  businessId: string;
  timezone: string;
  customerId: string;
  phone: string;
}

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'listar_servicos',
    description: 'Lista os serviços oferecidos pelo negócio, com duração e preço.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'listar_profissionais',
    description:
      'Lista os profissionais. Opcionalmente filtra pelos que executam um serviço específico.',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'id do serviço (opcional)' },
      },
    },
  },
  {
    name: 'consultar_disponibilidade',
    description:
      'Retorna os horários LIVRES de um serviço numa data. Use sempre antes de oferecer horários ao cliente. A data deve ser YYYY-MM-DD. Resolva "amanhã", "sábado" etc. para a data concreta usando a data de hoje informada no sistema.',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD no fuso do negócio' },
        professionalId: { type: 'string', description: 'opcional, p/ um profissional específico' },
      },
      required: ['serviceId', 'date'],
    },
  },
  {
    name: 'criar_agendamento',
    description:
      'Cria o agendamento. Só use startAt que tenha sido retornado por consultar_disponibilidade. Confirme serviço, profissional, dia e horário com o cliente ANTES de chamar.',
    input_schema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        professionalId: { type: 'string' },
        startAt: { type: 'string', description: 'ISO com offset, exatamente como veio da disponibilidade' },
        customerName: { type: 'string', description: 'nome do cliente, se ele informou' },
        notes: { type: 'string', description: 'observação do cliente (opcional)' },
      },
      required: ['serviceId', 'professionalId', 'startAt'],
    },
  },
  {
    name: 'meus_agendamentos',
    description: 'Lista os próximos agendamentos do cliente atual.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cancelar_agendamento',
    description: 'Cancela um agendamento do cliente pelo id.',
    input_schema: {
      type: 'object',
      properties: { appointmentId: { type: 'string' } },
      required: ['appointmentId'],
    },
  },
];

export class ToolExecutor {
  constructor(
    private prisma: PrismaService,
    private availability: AvailabilityService,
    private booking: BookingService,
  ) {}

  async run(name: string, input: any, ctx: AgentContext): Promise<string> {
    switch (name) {
      case 'listar_servicos': {
        const services = await this.prisma.service.findMany({
          where: { businessId: ctx.businessId, active: true },
          select: { id: true, name: true, durationMinutes: true, priceCents: true },
        });
        return JSON.stringify(
          services.map((s) => ({
            id: s.id,
            nome: s.name,
            duracaoMin: s.durationMinutes,
            preco: (s.priceCents / 100).toFixed(2),
          })),
        );
      }

      case 'listar_profissionais': {
        const pros = await this.prisma.professional.findMany({
          where: {
            businessId: ctx.businessId,
            active: true,
            ...(input.serviceId
              ? { services: { some: { serviceId: input.serviceId } } }
              : {}),
          },
          select: { id: true, name: true },
        });
        return JSON.stringify(pros.map((p) => ({ id: p.id, nome: p.name })));
      }

      case 'consultar_disponibilidade': {
        const avail = await this.availability.getAvailability({
          businessId: ctx.businessId,
          serviceId: input.serviceId,
          date: input.date,
          professionalId: input.professionalId,
        });
        // Devolve no formato enxuto: por profissional, horários com o ISO exato.
        return JSON.stringify(
          avail.map((a) => ({
            profissionalId: a.professionalId,
            profissional: a.professionalName,
            horarios: a.slots.map((s) => ({
              label: s.label,
              startAt: DateTime.fromJSDate(s.startAt).setZone(ctx.timezone).toISO(),
            })),
          })),
        );
      }

      case 'criar_agendamento': {
        if (input.customerName) {
          await this.booking.findOrCreateCustomer(ctx.businessId, ctx.phone, input.customerName);
        }
        try {
          const appt = await this.booking.createAppointment({
            businessId: ctx.businessId,
            customerId: ctx.customerId,
            professionalId: input.professionalId,
            serviceId: input.serviceId,
            startAtIso: input.startAt,
            notes: input.notes,
          });
          const when = DateTime.fromJSDate(appt.startAt)
            .setZone(ctx.timezone)
            .setLocale('pt-BR')
            .toFormat("cccc, dd/LL 'às' HH:mm");
          return JSON.stringify({
            ok: true,
            id: appt.id,
            confirmacao: `${appt.service.name} com ${appt.professional.name} — ${when}`,
          });
        } catch (e: any) {
          return JSON.stringify({ ok: false, erro: e?.message ?? 'falha ao agendar' });
        }
      }

      case 'meus_agendamentos': {
        const appts = await this.booking.getUpcomingForCustomer(ctx.businessId, ctx.customerId);
        return JSON.stringify(
          appts.map((a) => ({
            id: a.id,
            servico: a.service.name,
            profissional: a.professional.name,
            quando: DateTime.fromJSDate(a.startAt)
              .setZone(ctx.timezone)
              .setLocale('pt-BR')
              .toFormat("cccc, dd/LL 'às' HH:mm"),
          })),
        );
      }

      case 'cancelar_agendamento': {
        await this.booking.cancelAppointment(ctx.businessId, input.appointmentId);
        return JSON.stringify({ ok: true });
      }

      default:
        return JSON.stringify({ erro: `ferramenta desconhecida: ${name}` });
    }
  }
}
