# agend.ai

SaaS multi-tenant de agendamento conversacional por WhatsApp. O cliente fala naturalmente
("quero cortar cabelo sábado de tarde com o João"), um agente Claude entende,
consulta a agenda real e marca. Lembrete automático antes do horário reduz falta.

Diferença vs. Trinks/Booksy: lá o agendamento é formulário e o WhatsApp é só
lembrete. Aqui a marcação acontece **dentro da conversa**.

## Como funciona (fluxo de uma mensagem)

```
Cliente no WhatsApp
   │  "quero um corte sábado de tarde"
   ▼
Webhook (whatsapp.controller)  ── descobre de qual negócio é (pelo número)
   ▼
AgentService  ── loop de tool-use com o Claude
   │   1. listar_servicos / listar_profissionais
   │   2. consultar_disponibilidade  ◄── motor de slots (banco decide, não o modelo)
   │   3. confirma com o cliente
   │   4. criar_agendamento          ◄── recheck de conflito em transação
   ▼
Resposta de volta no WhatsApp
```

A regra de ouro: **o modelo nunca inventa horário**. Ele só oferta o que o
motor retornou e grava o que foi ofertado. Isso evita o clássico "a IA marcou
num horário que não existe".

## Arquitetura

| Camada | Arquivo | Papel |
|---|---|---|
| Motor de slots | `src/availability/slot-engine.ts` | Cálculo puro de horários livres (testado) |
| Disponibilidade | `src/availability/availability.service.ts` | Busca dados no banco e alimenta o motor |
| Booking | `src/booking/booking.service.ts` | Cria/cancela com recheck anti-overbooking |
| Agente | `src/agent/agent.service.ts` + `tools.ts` | Loop Claude + ferramentas ligadas ao banco |
| WhatsApp | `src/whatsapp/*` | Provider plugável + webhook |
| Lembretes | `src/reminder/reminder.service.ts` | Cron que dispara lembrete e mata no-show |
| Dados | `prisma/schema.prisma` | Multi-tenant: 1 Business = 1 comércio |

## Rodar

```bash
npm install
cp .env.example .env          # preencha DATABASE_URL, ANTHROPIC_API_KEY, WhatsApp
npm run prisma:generate
npm run prisma:migrate         # cria as tabelas
npm run seed                   # sobe a "Barbearia do Zé" de teste
npm run start:dev
```

Testar só o motor de horários (não precisa de banco):

```bash
npm run test:engine
```

## Conectar o WhatsApp

1. App no Meta for Developers → produto WhatsApp → pega `WHATSAPP_TOKEN` e
   `WHATSAPP_PHONE_NUMBER_ID`.
2. Configura o webhook apontando pra `https://SEU_DOMINIO/webhook/whatsapp`
   com o `WHATSAPP_VERIFY_TOKEN` que você definiu no `.env`.
3. Pra trocar por Evolution/Z-API: implemente a interface `WhatsAppProvider`
   e troque o provider no módulo. Nada mais muda.

## O que já está pronto

- Motor de disponibilidade com fuso, almoço, duração, antecedência e bloqueios (testado, 6/6).
- Booking com recheck transacional anti-overbooking.
- Agente conversacional completo (tool-use, histórico multi-turn persistido).
- Webhook do WhatsApp (Cloud API) + provider plugável.
- Lembrete automático 24h antes.
- Multi-tenant desde o schema.

## Próximos passos (não feitos ainda)

- **Painel do dono** (Next.js): CRUD de serviços/profissionais/horários, agenda visual,
  bloqueios. É commodity — o grosso é tela.
- **Página pública de agendamento** (fallback p/ quem prefere clicar em vez de conversar).
- **Confirmação por SIM/NÃO**: tratar a resposta do lembrete (hoje só envia).
- **Exclusion constraint no Postgres** (`btree_gist`) pra garantia de zero overbooking
  no nível do banco, além do recheck.
- **Dedupe de webhook** com Redis/tabela (hoje é em memória).
- **Pagamento/sinal** via Stripe pra reduzir no-show (cobrança de sinal no ato).
```
