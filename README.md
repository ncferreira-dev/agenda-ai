# agend.ai

**SaaS multi-tenant de agendamento conversacional por WhatsApp.** O cliente final fala
naturalmente — _"quero cortar o cabelo sábado de tarde com o João"_ — um agente Claude
entende, **consulta a agenda real** e marca. Um lembrete automático antes do horário
reduz o no-show.

> Diferencial vs. Trinks/Booksy: lá o agendamento é formulário e o WhatsApp é só lembrete.
> Aqui a marcação acontece **dentro da conversa** — ou por uma página web, para quem prefere clicar.

**Stack:** TypeScript · NestJS · Prisma · PostgreSQL · Next.js (App Router) · Anthropic SDK · Stripe · Docker · Render/Vercel

---

## Sumário

- [O problema](#o-problema)
- [Como funciona (fluxo de uma mensagem)](#como-funciona-fluxo-de-uma-mensagem)
- [Decisões de arquitetura](#decisões-de-arquitetura)
- [Mapa do código](#mapa-do-código)
- [Rodando localmente](#rodando-localmente)
- [Testes e CI](#testes-e-ci)
- [Status do projeto](#status-do-projeto)

---

## O problema

Comércios de serviço (barbearia, salão, clínica, oficina, vet) marcam horário no
WhatsApp, na mão. Isso gera três dores: agenda bagunçada, overbooking, e falta
(no-show) porque ninguém lembra o cliente. As ferramentas de mercado empurram o
cliente para um formulário — atrito que muita gente não vence.

**agend.ai** deixa o cliente marcar do jeito que ele já usa: conversando. E garante,
no nível de engenharia, que a IA nunca marque um horário que não existe.

## Como funciona (fluxo de uma mensagem)

```
Cliente no WhatsApp
   │  "quero um corte sábado de tarde com o João"
   ▼
Webhook (whatsapp.controller)  ── descobre de qual negócio é (pelo número) + dedupe
   ▼
AgentService  ── loop de tool-use com o Claude
   │   1. listar_servicos / listar_profissionais
   │   2. consultar_disponibilidade  ◄── motor de slots (o banco decide, não o modelo)
   │   3. confirma com o cliente
   │   4. criar_agendamento          ◄── recheck de conflito dentro de transação
   ▼
Resposta de volta no WhatsApp     ── lembrete automático agendado (confirma SIM/NÃO)
```

**A regra de ouro: o modelo nunca inventa horário.** O agente só oferta os slots que o
motor de disponibilidade retornou e só grava o que foi ofertado. Isso elimina o clássico
"a IA marcou num horário que não existe".

## Decisões de arquitetura

As escolhas abaixo são o coração do projeto — priorizei **correção e isolamento** sobre
velocidade de entrega.

- **Multi-tenant de verdade, escopado por `businessId`.** Um sistema, vários comércios
  isolados. Nenhuma query cruza tenants; a resolução do negócio acontece na borda
  (número do WhatsApp / slug da página) e um guard garante o escopo no painel.

- **Motor de slots puro e testado.** `slot-engine.ts` não depende de banco: recebe
  jornada, duração, almoço, antecedência e bloqueios e devolve os horários livres.
  Fuso resolvido com Luxon; horários gravados em UTC e convertidos só na borda. É a
  fonte única da verdade sobre disponibilidade — por isso é testável e determinístico.

- **Zero overbooking em duas camadas.** Além do recheck de conflito dentro de uma
  transação, o Postgres tem uma **exclusion constraint** (`btree_gist`,
  `appointment_no_overlap`) que torna a sobreposição de horários por profissional
  **impossível no nível do banco** — mesmo sob corrida.

- **CPF sob LGPD via blind index.** O CPF do dono nunca é gravado em claro: guardo um
  HMAC-SHA256 (blind index) que permite buscar sem expor o dado. O segredo é
  obrigatório e definitivo (mudá-lo invalida os hashes).

- **Envs críticas sem fallback inseguro.** `JWT_SECRET` e `CPF_HASH_SECRET` são
  obrigatórias: a aplicação **falha no boot** com erro claro em vez de subir insegura
  com um valor padrão.

- **Provider de WhatsApp plugável.** O webhook fala com uma interface `WhatsAppProvider`.
  Trocar Cloud API por Evolution/Z-API é implementar a interface e trocar no módulo —
  nada mais muda.

- **Degradação graciosa.** Web Push, e-mail transacional e storage em bucket S3 são
  opcionais: sem as envs, o recurso simplesmente não dispara, sem quebrar o resto.

## Mapa do código

```
/                     backend NestJS (API)
  prisma/             schema multi-tenant + seed
  src/availability/   motor de slots (PURO, testado) + service
  src/booking/        criação/cancelamento com recheck anti-overbooking
  src/agent/          loop de tool-use do Claude + ferramentas
  src/whatsapp/       provider plugável + webhook (com dedupe)
  src/public/         API REST pública (cliente final, tenant por slug)
  src/reminder/       cron de lembrete + confirmação SIM/NÃO
  src/billing/        assinatura Stripe (trial, checkout, webhook)
web/                  frontend Next.js (página pública de agendamento)
```

| Camada | Arquivo | Papel |
|---|---|---|
| Motor de slots | `src/availability/slot-engine.ts` | Cálculo puro de horários livres (testado) |
| Disponibilidade | `src/availability/availability.service.ts` | Busca no banco e alimenta o motor |
| Booking | `src/booking/booking.service.ts` | Cria/cancela com recheck transacional |
| Agente | `src/agent/agent.service.ts` + `tools.ts` | Loop Claude + ferramentas ligadas ao banco |
| WhatsApp | `src/whatsapp/*` | Provider plugável + webhook + dedupe |
| Billing | `src/billing/*` | Assinatura Stripe com trial de 14 dias |
| Lembretes | `src/reminder/reminder.service.ts` | Cron que dispara e trata SIM/NÃO |
| Dados | `prisma/schema.prisma` | Multi-tenant: 1 `Business` = 1 comércio |

## Rodando localmente

**Backend (API — porta 3000)**

```bash
npm install
cp .env.example .env            # preencha DATABASE_URL, JWT_SECRET, CPF_HASH_SECRET, ANTHROPIC_API_KEY...
docker compose up -d            # sobe um Postgres local (docker-compose.yml)
npm run prisma:generate
npm run prisma:migrate          # cria as tabelas
npm run seed                    # sobe a "Barbearia do Zé" de teste
npm run start:dev
```

**Frontend (página pública — porta 3001)**

```bash
cd web
npm install
cp .env.local.example .env.local
npm run dev                     # http://localhost:3001/barbearia-do-ze
```

O `.env.example` documenta cada variável: as **obrigatórias** em produção (a API não sobe
sem elas) e as **opcionais** que degradam com elegância quando vazias.

## Testes e CI

O motor de horários e os cálculos de preço são puros, então rodam **sem banco**:

```bash
npm run test:engine     # motor de disponibilidade
npm run test:pricing    # preços do plano
```

Um workflow do **GitHub Actions** (`.github/workflows/ci.yml`) roda a cada push:
checagem de tipos do backend e do site (`tsc --noEmit`) + os testes acima. Como o deploy
é contínuo (Render/Vercel a cada push na `main`), o CI é a rede que impede código
quebrado de ir direto pro ar.

## Status do projeto

**Em produção / pronto:**

- Motor de disponibilidade com fuso, almoço, duração, antecedência e bloqueios (pontuais e recorrentes) — testado.
- Booking transacional com **exclusion constraint** no Postgres contra overbooking.
- Agente conversacional de WhatsApp completo (tool-use, histórico multi-turn persistido).
- Webhook do WhatsApp (Cloud API) com **dedupe** + provider plugável.
- **API pública REST** (cliente identificado por telefone, sem login) e **página de agendamento** (Next.js).
- Lembrete automático via cron com **confirmação SIM/NÃO** de volta no WhatsApp.
- **Painel do dono** completo: serviços, profissionais, horários, bloqueios, e CRM com segmentação.
- **Auth do dono**: JWT + argon2 + Google OAuth + reset de senha por link; guard/decorator de tenant.
- **Billing Stripe**: assinatura recorrente com trial de 14 dias (checkout + webhook, testados em modo teste).
- Web Push, e-mail transacional e resumo diário pro dono; tema por negócio (`--accent`).

**Próximos passos:**

- Stripe em produção (trocar chaves de teste pelas `sk_live_` e cadastrar o webhook de produção).
- Agenda visual (calendário dia/semana) no painel, além das listas atuais.

## Capturas de tela

> _(a adicionar: página pública de agendamento, conversa no WhatsApp e painel do dono)_

---

## Licença

Distribuído sob a licença [PolyForm Noncommercial 1.0.0](LICENSE.md): o código é aberto para estudo e uso não-comercial, mas o uso comercial por terceiros não é permitido. Projeto autoral, desenvolvido do zero.
