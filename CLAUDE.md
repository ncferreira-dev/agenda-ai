# CLAUDE.md

Contexto pro Claude Code. Leia antes de gerar ou alterar código.

## O que é

**agend.ai** — SaaS multi-tenant de agendamento por WhatsApp pra comércios de serviço
(barbearia, salão, vet, clínica, oficina). O cliente final agenda **conversando
no WhatsApp** (diferencial) ou por uma **página web**. Lembrete automático antes
do horário reduz no-show.

Stack: NestJS + Prisma + PostgreSQL + Luxon + Anthropic SDK (api/) e Next.js
App Router (web/). Idioma do produto e dos commits: pt-BR.

## Como você deve trabalhar comigo (IMPORTANTE)

- SEMPRE me mostre um plano do que vai fazer ANTES de editar arquivos. Espere meu OK.
- Faça UMA tarefa por vez. Se eu pedir várias coisas, me proponha uma ordem e faça uma de cada vez.
- Trabalhe numa branch nova para qualquer mudança que não seja trivial. Não commite sem eu revisar.
- Depois de QUALQUER alteração, rode `tsc --noEmit` e a build (web e/ou backend) e me diga se passou. Se der erro, conserte antes de me entregar.
- Nunca remova código só por parecer "não usado" sem primeiro me mostrar onde confirmou que não é chamado.
- Se algo for irreversível (apagar dados, migração destrutiva, mudar permissão), me avise e espere confirmação antes de agir.

## Estrutura

```
/                  → backend NestJS (api)
  prisma/          → schema + seed
  src/availability → motor de slots (PURO, testado) + service
  src/booking      → criação/cancelamento com recheck anti-overbooking
  src/agent        → loop de tool-use do Claude + ferramentas
  src/whatsapp     → provider plugável + webhook
  src/public       → API REST pública (cliente final, tenant por slug)
  src/reminder     → cron de lembrete
web/               → frontend Next.js (página pública de agendamento)
```

## Regras de ouro (NÃO QUEBRAR)

1. **Multi-tenant sempre.** Tudo é escopado por `businessId`. Nenhuma query
   pode cruzar tenants. Um negócio nunca vê dados de outro. Pense "prédio de
   apartamentos": um sistema, vários negócios isolados pelo `businessId`.

2. **O modelo nunca inventa horário.** O agente só oferta horários que vieram
   de `AvailabilityService` e só grava o que foi ofertado. Toda disponibilidade
   passa pelo `slot-engine.ts`, que é a fonte da verdade.

3. **O motor de slots é puro e testado.** `src/availability/slot-engine.ts` não
   depende de banco. Se mexer nele, rode `npm run test:engine` e mantenha 100%.
   Fuso resolvido com Luxon; horários gravados em UTC, convertidos só na borda.

4. **Booking revalida em transação.** `createAppointment` rechecka conflito
   dentro de uma transação pra evitar overbooking. Não remova esse recheck.

5. **Três superfícies, três acessos:**
   - Site de marketing (público) — sua marca.
   - Painel do dono (`app.*`) — login + senha, sessão escopada ao negócio.
   - Agendamento do cliente (slug/subdomínio ou WhatsApp) — **sem login**,
     cliente identificado por telefone (`Customer` = businessId + phone).

6. **Cliente final nunca loga.** É sempre identificado por telefone. Nunca
   adicione fluxo de login pro cliente final.

7. **Envs críticas sem fallback inseguro.** `JWT_SECRET` e `CPF_HASH_SECRET`
   são obrigatórias — nunca coloque um valor padrão hardcoded no lugar delas.

8. **Pagamento é Stripe** (assinatura recorrente). Ignore/remova referências a
   Mercado Pago quando eu pedir.

## Rodar

Backend:
```bash
npm install && cp .env.example .env   # preencha DATABASE_URL, ANTHROPIC_API_KEY, WhatsApp
npm run prisma:generate && npm run prisma:migrate && npm run seed
npm run start:dev          # porta 3000
npm run test:engine        # testa o motor (sem banco)
```

Frontend:
```bash
cd web && npm install && cp .env.local.example .env.local
npm run dev                # porta 3001 -> http://localhost:3001/barbearia-do-ze
```

## Convenções

- Siga os padrões que já existem no arquivo que você está editando; não
  reformate o projeto inteiro.
- TypeScript estrito. Comentários e mensagens ao usuário em pt-BR.
- Nunca use `any` sem necessidade; tipe os contratos de API.
- Datas: Luxon, fuso do negócio. Nunca `new Date()` pra lógica de agenda sem fuso.
- Telefone em E.164 (ex.: 5511999998888).

## O que já está pronto

Motor de slots (testado), booking transacional com exclusion constraint no
Postgres (`appointment_no_overlap`), agente conversacional, webhook de WhatsApp
com dedupe (`ProcessedWebhook`), API pública REST, página de agendamento (web/),
lembrete via cron com confirmação SIM/NÃO de volta no WhatsApp, painel do dono
completo (serviços, profissionais, horários, bloqueios pontuais e recorrentes,
CRM com segmentação), auth do dono (JWT + argon2 + Google OAuth + reset de senha
por link), guard/decorator de tenant, billing/assinatura Stripe com trial de 14
dias e programa de indicações, web push e resumo diário pro dono, tema por
negócio (`--accent` a partir do Business).

## Próximos passos (peça ao Claude Code conforme for precisando)

- **Stripe ao vivo**: hoje a assinatura é confirmada por endpoint de dev
  (`BillingService.confirmSubscription`). Falta ligar o webhook de produção do
  Stripe (assinatura criada / paga / cancelada) escrevendo `subscriptionStatus`,
  datas do período e crédito de indicação de forma idempotente.
- **Agenda visual no painel**: visão de calendário (dia/semana) pro dono, além
  das listas atuais.

> Descartado de propósito (não repropor): **cobrança de sinal no agendamento** —
> removido junto com `client_deposit`. Pagamento é só a assinatura recorrente do
> dono via Stripe.
