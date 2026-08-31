import type Anthropic from '@anthropic-ai/sdk';
import { DateTime } from 'luxon';
import { AvailabilityService } from '../availability/availability.service';
import { BookingService } from '../booking/booking.service';
import { PrismaService } from '../prisma/prisma.service';
import { effectivePriceCents } from '../pricing/service-price';

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

  async run(name: string, input: EntradaDaFerramenta, ctx: AgentContext): Promise<string> {
    switch (name) {
      case 'listar_servicos': {
        const services = await this.prisma.service.findMany({
          where: { businessId: ctx.businessId, active: true },
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
        });
        return JSON.stringify(
          services.map((s) => {
            const finalCents = effectivePriceCents(s);
            return {
              id: s.id,
              nome: s.name,
              duracaoMin: s.durationMinutes,
              // preço a ofertar ao cliente = COM desconto; precoCheio só quando há desconto.
              preco: (finalCents / 100).toFixed(2),
              ...(finalCents < s.priceCents ? { precoCheio: (s.priceCents / 100).toFixed(2) } : {}),
              ...(s.isKit ? { kit: true, inclui: s.kitItems.map((k) => k.member.name) } : {}),
            };
          }),
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
        // try/catch como no criar_agendamento: um serviceId inexistente/obsoleto
        // (ou uma data malformada que o modelo montou) faz getAvailability lançar
        // — sem o catch, a exceção derruba o turno e some com o histórico da
        // conversa. Devolvendo {ok:false, erro} o modelo se recupera.
        if (!input.serviceId || !input.date) {
          return JSON.stringify({
            ok: false,
            erro: 'faltou o serviço ou a data — pergunte ao cliente e chame de novo',
          });
        }
        try {
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
        } catch (e) {
          return JSON.stringify({ ok: false, erro: mensagemDoErro(e, 'não consegui consultar os horários') });
        }
      }

      case 'criar_agendamento': {
        // Quem preenche estes campos é o modelo, e modelo esquece campo. Com
        // `input: any` o undefined descia até o Prisma e voltava como erro de
        // banco, que o modelo não sabe corrigir. Dizendo o que faltou, ele
        // pergunta ao cliente e tenta de novo.
        if (!input.professionalId || !input.serviceId || !input.startAt) {
          return JSON.stringify({
            ok: false,
            erro: 'faltou profissional, serviço ou horário — pergunte ao cliente e chame de novo',
          });
        }
        if (input.customerName) {
          await this.booking.findOrCreateCustomer(ctx.businessId, ctx.phone, input.customerName);
        }
        try {
          const { appointment: appt } = await this.booking.createAppointment({
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
        } catch (e) {
          return JSON.stringify({ ok: false, erro: mensagemDoErro(e, 'falha ao agendar') });
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
        // ctx.customerId trava no dono do agendamento. O id vem de texto livre
        // do cliente (ou de quem conseguir induzir o modelo), então sem esse
        // filtro dá pra cancelar o horário de outra pessoa do mesmo negócio.
        //
        // try/catch como no criar_agendamento: um id inexistente/alheio/alucinado
        // faz cancelAppointment lançar BadRequestException. Sem o catch, a exceção
        // sobe por handleMessage e derruba o turno inteiro — o histórico da
        // conversa não é salvo e o cliente recebe um erro genérico. Devolvendo
        // {ok:false, erro} o modelo entende "não achei" e responde direito.
        if (!input.appointmentId) {
          return JSON.stringify({
            ok: false,
            erro: 'faltou o id do agendamento — liste os agendamentos antes de cancelar',
          });
        }
        try {
          await this.booking.cancelAppointment(
            ctx.businessId,
            input.appointmentId,
            ctx.customerId,
          );
          return JSON.stringify({ ok: true });
        } catch (e) {
          return JSON.stringify({ ok: false, erro: mensagemDoErro(e, 'não consegui cancelar') });
        }
      }

      default:
        return JSON.stringify({ erro: `ferramenta desconhecida: ${name}` });
    }
  }
}// Argumentos que o modelo pode mandar numa chamada de ferramenta. Tudo opcional
// porque quem preenche é o LLM: ele erra, inventa campo e omite obrigatório, e o
// código já trata isso caso a caso. Antes era `any`, o que desligava a checagem
// no arquivo inteiro; escrito assim, acrescentar ferramenta que espera um campo
// novo obriga a declará-lo aqui.
export interface EntradaDaFerramenta {
  serviceId?: string;
  professionalId?: string;
  date?: string;
  startAt?: string;
  customerName?: string;
  notes?: string;
  appointmentId?: string;
}

// `catch (e)` entrega unknown, que é o certo: o que é lançado pode não ser Error
// (uma string, um objeto do driver). Antes era `catch (e: any)` com `e?.message`,
// que devolvia undefined em silêncio quando o lançado não tinha message.
function mensagemDoErro(e: unknown, padrao: string): string {
  return e instanceof Error && e.message ? e.message : padrao;
}


