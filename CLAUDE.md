# CLAUDE.md

Contexto pro Claude Code. Leia antes de gerar ou alterar código.

## O que é

SaaS multi-tenant de agendamento por WhatsApp pra comércios de serviço
(barbearia, salão, vet, clínica, oficina). O cliente final agenda **conversando
no WhatsApp** (diferencial) ou por uma **página web**. Lembrete automático antes
do horário reduz no-show.

Stack: NestJS + Prisma + PostgreSQL + Luxon + Anthropic SDK (api/) e Next.js
App Router (web/). Idioma do produto e dos commits: pt-BR.

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

- TypeScript estrito. Comentários e mensagens ao usuário em pt-BR.
- Nunca use `any` sem necessidade; tipe os contratos de API.
- Datas: Luxon, fuso do negócio. Nunca `new Date()` pra lógica de agenda sem fuso.
- Telefone em E.164 (ex.: 5511999998888).

## O que já está pronto

Motor de slots (testado), booking transacional, agente conversacional, webhook
de WhatsApp, API pública REST, página de agendamento (web/), lembrete via cron.

## Próximos passos (peça ao Claude Code conforme for precisando)

- **Auth do dono**: módulo NestJS com Passport JWT, senha com hash (argon2/bcrypt),
  sessão carregando `businessId`. Guard que injeta o tenant no contexto.
- **Middleware de tenant**: resolve `businessId` por subdomínio/slug (público) ou
  por JWT (painel) e escopa todas as queries.
- **Painel do dono** (Next): CRUD de serviços/profissionais/horários, agenda
  visual, bloqueios. Reaproveita a API; é majoritariamente tela.
- **Resposta SIM/NÃO do lembrete**: tratar a confirmação que volta no WhatsApp.
- **Exclusion constraint** (`btree_gist`) no Postgres como garantia extra de
  zero overbooking, além do recheck.
- **Stripe**: cobrança de sinal no ato do agendamento pra derrubar no-show.
- **Tema por negócio**: injetar `--accent` da página a partir de um campo do Business.
