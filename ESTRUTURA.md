AGEND.AI — MAPA DA ESTRUTURA DO PROJETO
(gerado em 2026-07-10, direto do código real do repositório)


================================
1. ÁRVORE DE PASTAS E ARQUIVOS
================================

RAIZ (backend NestJS)
  prisma/
    schema.prisma — schema completo (todos os models, ver seção 2)
    seed.ts — dados de exemplo pra dev
    migrations/ — 29 migrations, da inicial (22/06) até cpfHash/PasswordReset (09/07)
  src/
    main.ts — bootstrap do Nest, CORS via WEB_ORIGIN
    app.module.ts — módulo raiz, importa todos os outros

    agent/ — loop de tool-use do Claude (agente conversacional do WhatsApp)
      agent.service.ts — chama a Anthropic API; init PREGUIÇOSO do client
        (só cria o Anthropic() na primeira chamada; sem API key o app sobe
        normal e só falha se alguém tentar usar o agente)
      tools.ts — ferramentas que o modelo pode chamar (sempre lê do
        AvailabilityService, nunca inventa horário)
      agent.module.ts

    auth/ — login do dono (JWT)
      auth.controller.ts — login, registro, OAuth Google
      auth.service.ts — regra de negócio de auth
      jwt-secret.ts — exige JWT_SECRET obrigatório em produção (sem fallback)
      guards/jwt-auth.guard.ts, guards/google-oauth.guard.ts
      strategies/jwt.strategy.ts, strategies/google.strategy.ts
      decorators/current-business.decorator.ts — injeta o tenant no request

    availability/ — MOTOR DE SLOTS (fonte da verdade, puro, testado)
      slot-engine.ts — cálculo puro de horários (sem banco)
      availability.service.ts — liga o motor ao Prisma

    billing/ — assinatura do dono (planos/preços)
      billing.controller.ts — GET /me/plan, /me/plan/quote, /me/referrals,
        POST /me/plan/confirm (endpoint provisório — checkout ainda não ligado)
      billing.service.ts — grava datas de assinatura, confirmSubscription()
      plan-catalog.ts — catálogo dos planos (Start/Pro/Ultra)
      pricing.ts — cálculo de preço/quote
      referral.service.ts — lógica do programa de indicação

    booking/ — criação/cancelamento de agendamento
      booking.service.ts — cria Appointment com recheck transacional
        anti-overbooking (não mexer sem entender a Regra de Ouro nº 4)

    common/ — utilitários compartilhados
      cpf.ts — blind index do CPF via HMAC-SHA256 (CPF_HASH_SECRET, obrigatório)
      env.ts — helper requiredInProd() (falha o boot se faltar env crítica)
      referral-code.ts, slug.ts

    follow-up/ — convite de retorno pro cliente
      follow-up.service.ts, render-message.ts

    mail/ — envio de e-mail (mail.service.ts)

    notifications/ — avisos pro dono (novo agendamento + resumo diário)
      daily-summary.service.ts, notifications.service.ts

    panel/ — API do painel do dono (CRUD principal)
      panel.controller.ts — perfil, negócio, agendamentos, clientes, relatório
      blocks/ — bloqueios pontuais e recorrentes
      professionals/ — CRUD de profissionais + horários de trabalho
      services/ — CRUD de serviços (inclui kits)
      uploads.controller.ts — upload de imagens (logo, capa, fotos)

    presets/ — dados de apoio ao onboarding
      profissoes.ts, verticais.ts (temas visuais por ramo)

    pricing/ — service-price.ts (preço com desconto aplicado, helper puro)

    prisma/ — prisma.module.ts, prisma.service.ts (client injetável)

    public/ — API pública (cliente final, sem login)
      public-booking.controller.ts — a API que a página [slug] consome

    push/ — Web Push pro dono (push.controller.ts, push.service.ts)

    reminder/ — cron de lembrete de agendamento (reminder.service.ts)

    storage/ — abstração de armazenamento de arquivo (storage.service.ts)
      OBS: uploads/ na raiz — armazenamento local, efêmero em produção (Render
      sem disco persistente apaga em cada deploy — item já mapeado como risco)

    whatsapp/ — integração com WhatsApp
      whatsapp.controller.ts — webhook (GET verifica, POST recebe mensagem)
      whatsapp.provider.ts — provider plugável (troca de fornecedor sem
        reescrever o resto)
      confirmation.service.ts — trata resposta SIM/NÃO do lembrete
      messaging.module.ts

  Dockerfile, docker-compose.yml, docker-compose.prod.yml, docker-entrypoint.sh
  render.yaml — Blueprint do Render (agendai-db + agendai-api)
  CLAUDE.md — regras de ouro do projeto pro Claude Code


web/ (frontend Next.js — App Router)
  src/app/
    layout.tsx, page.tsx — site de marketing (raiz)

    [slug]/ — PÁGINA PÚBLICA DE AGENDAMENTO (sem login, por negócio)
      page.tsx — carrega o negócio pelo slug
      BookingFlow.tsx — fluxo página única (serviço → profissional → dia →
        hora → observação), com auto-scroll

    painel/ — PAINEL DO DONO (área logada, app.*)
      layout.tsx, MaskedInput.tsx, actions.ts
      login/page.tsx, registro/page.tsx — públicos
      onboarding/ — OnboardingWizard.tsx, page.tsx (wizard "qual seu negócio")
      oauth/callback/route.ts — retorno do login social
      api/ — rotas de API do próprio Next (proxy pro backend)
        login/route.ts, logout/route.ts, register/route.ts
        oauth/google/route.ts, plan/confirm/route.ts

      (app)/ — grupo de rotas autenticadas (layout comum)
        page.tsx — agenda/dashboard
        Nav.tsx, CopyLink.tsx, EditSlug.tsx, ItemsEditor.tsx
        servicos/ — ServicesManager.tsx (CRUD serviços + kits)
        profissionais/ — ProfessionalsManager.tsx, HoursEditor.tsx
        bloqueios/ — BlocksManager.tsx, RecurringBlocksManager.tsx
        clientes/ — ClientesView.tsx, SegmentTag.tsx, SegmentationConfig.tsx,
          [id]/page.tsx (perfil do cliente), WhatsAppButton.tsx
        aparencia/ — AppearanceForm.tsx (logo/capa/cor)
        negocio/ — BusinessForm.tsx (dados do negócio)
        notificacoes/ — NotificationsForm.tsx, PushDeviceButton.tsx
        perfil/ — ProfileForm.tsx, PasswordForm.tsx
        planos/ — page.tsx, AssinarButton.tsx, plans.ts (catálogo local)
        meu-plano/page.tsx
        indicacoes/ — ReferralLink.tsx, page.tsx (programa de indicação)
        divulgar/ — DivulgarView.tsx, page.tsx
        relatorio/page.tsx

    middleware.ts — protege /painel/* (checa cookie; libera login/registro/
      oauth/api sem token)

  src/lib/ — api.ts, panel-api.ts, panel-session.ts, format.ts, types.ts
  src/components/Typewriter.tsx


================================
2. MODELS DO PRISMA (schema.prisma)
================================

Business — o comércio (tenant). Campos-chave: name, slug (único, usado na
  URL), timezone, phone, address, serviceMode (PRESENCIAL/REMOTO/HIBRIDO),
  meetingUrl, slotStepMinutes, minLeadMinutes, maxAdvanceDays,
  reminderHoursBefore, logoUrl, coverUrl, accentColor, about, instagramUrl,
  profession, themePreset, onboardedAt, limiares de segmentação de clientes
  (inactiveDays, vipMinSpentCents, recurringMinVisits), flags de notificação
  (notifyWhatsApp/Email/Push/OwnerAllBookings/DailySummary), plan,
  subscriptionStatus (TRIALING/ACTIVE/PAST_DUE/CANCELED), trialEndsAt,
  subscribedAt, launchPricingEndsAt, currentPeriodEndsAt, referralCode,
  referredByCode, referralCreditCents.

Referral — atribuição de indicação entre dois Business. Campos: referrer/
  referredBusinessId, code, status (PENDING/CONVERTED/EXPIRED),
  referredDiscountApplied, referrerRewarded, convertedAt.

PushSubscription — inscrição Web Push do dono. endpoint (único), p256dh,
  auth, userAgent, businessId.

Owner — dono do negócio (login do painel). email (único), passwordHash
  (nullable — null se só usa login social), name, phone, cpfHash (único,
  blind index HMAC), cep, photoUrl, passwordChangedAt (invalida JWTs antigos).

OAuthProvider (enum: GOOGLE) / OAuthAccount — conta social vinculada a um
  Owner (provider + providerAccountId único).

AuthExchange — code de uso único pós-OAuth (codeHash, expiresAt, usedAt).

PasswordReset — pedido de redefinição de senha (tokenHash único, expiresAt,
  usedAt).

Professional — quem executa o serviço. name, active, phone, email, cpf,
  photoUrl.

WorkingHour — horário de trabalho recorrente. weekday (0-6), startMinute,
  endMinute.

DiscountKind (enum: PERCENT, FIXED).

Service — serviço ofertado. name, durationMinutes, priceCents, active,
  discountKind, discountValue, isKit (+ kitItems/kitOf via KitItem),
  serviceMode (herda do negócio se null), followUpDays, followUpMessage.

KitItem — composição de um kit (kitServiceId + memberServiceId + position).

ProfessionalService — tabela N:N profissional×serviço.

Customer — cliente final. name, phone (E.164, único por negócio), email,
  ownerNote (privada).

AppointmentStatus (enum: PENDING, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW).

Appointment — o agendamento. customerId, professionalId, serviceId,
  startAt/endAt (UTC), status, notes, totalCents (soma dos itens),
  reminderSentAt, confirmationSentAt, customerConfirmedAt, followUpSentAt,
  manualPaidAt (pagamento marcado à mão pelo dono).

AppointmentItem — itens cobrados no atendimento (serviço principal + extras).
  name, priceCents, sourceServiceId.

TimeBlock — bloqueio pontual (startAt/endAt UTC, reason). professionalId
  null = bloqueia o negócio inteiro.

RecurringBlock — bloqueio recorrente por dia da semana (weekday,
  startMinute, endMinute, reason).

Conversation — histórico de conversa do WhatsApp por cliente (messages em
  JSON, formato da Anthropic API).

ProcessedWebhook — dedupe de webhooks já processados (providerMessageId
  como chave única).


================================
3. ROTAS DO BACKEND (NestJS)
================================

AUTH — /auth
  POST /auth/login
  POST /auth/register
  GET  /auth/oauth/google
  GET  /auth/oauth/google/callback
  POST /auth/oauth/exchange

BILLING — /me
  GET  /me/plan
  GET  /me/plan/quote
  GET  /me/referrals
  POST /me/plan/confirm  (provisório — checkout ainda não ligado a nenhum
       provedor de pagamento real)

PAINEL — /me
  GET    /me                          (dados do dono logado)
  PATCH  /me/profile
  PATCH  /me/password
  PATCH  /me/business
  GET    /me/verticais
  POST   /me/onboarding/apply
  POST   /me/onboarding/finish
  GET    /me/appointments
  PATCH  /me/appointments/:id/cancel
  PATCH  /me/appointments/:id/status
  PATCH  /me/appointments/:id/paid
  PATCH  /me/appointments/:id/items
  GET    /me/customers
  GET    /me/customers/:id
  PATCH  /me/customers/:id
  GET    /me/report
  GET    /me/report/by-professional

BLOQUEIOS — /me/blocks e /me/recurring-blocks
  GET / POST / DELETE :id   (nos dois)

PROFISSIONAIS — /me/professionals
  GET, POST, PATCH :id, DELETE :id
  GET  /me/professionals/:id/working-hours
  PUT  /me/professionals/:id/working-hours

SERVIÇOS — /me/services
  GET, POST, PATCH :id, DELETE :id

UPLOADS — POST /me/uploads

PÚBLICA (cliente final, sem login) — /b/:slug
  GET   /b/:slug                        (dados do negócio pro booking)
  GET   /b/:slug/appointments
  PATCH /b/:slug/appointments/:id/cancel
  GET   /b/:slug/availability
  POST  /b/:slug/bookings

PUSH — /me/push
  GET    /me/push/vapid
  POST   /me/push/subscriptions
  DELETE /me/push/subscriptions

WHATSAPP — /webhook/whatsapp
  GET  (verificação do webhook)
  POST (recebe mensagens)


================================
4. PÁGINAS DO NEXT.JS (web/)
================================

/                          — site de marketing
/[slug]                    — página pública de agendamento do negócio

/painel/login              — login (público)
/painel/registro           — cadastro do dono (público)
/painel/oauth/callback     — retorno do login social (público)
/painel/onboarding         — wizard "qual é o seu negócio" (autenticado)

/painel                    — dashboard/agenda (autenticado, layout (app))
/painel/servicos           — CRUD de serviços e kits
/painel/profissionais      — CRUD de profissionais + horários
/painel/bloqueios          — bloqueios pontuais e recorrentes
/painel/clientes           — lista de clientes (CRM)
/painel/clientes/[id]      — perfil do cliente
/painel/aparencia          — logo/capa/cor do negócio
/painel/negocio            — dados do negócio
/painel/notificacoes       — preferências de aviso (WhatsApp/e-mail/push)
/painel/perfil             — perfil e senha do dono
/painel/planos             — escolha de plano (Start/Pro/Ultra)
/painel/meu-plano          — estado da assinatura atual
/painel/indicacoes         — programa de indicação
/painel/divulgar           — materiais de divulgação
/painel/relatorio          — relatório/faturamento


================================
5. DIVERGÊNCIAS ENCONTRADAS vs. RESUMO ENVIADO
================================

1) CHECKOUT: STRIPE — RESOLVIDO (2026-07-10)
   O código de billing (billing.controller.ts, billing.service.ts,
   plan-catalog.ts, pricing.ts, billing.module.ts) tinha sido comentado
   inteiramente em torno do MERCADO PAGO, mas não havia nenhuma integração
   real de nenhum provedor (sem SDK, sem chamada de API de pagamento).
   Decisão confirmada: seguir com STRIPE. Os comentários já foram
   atualizados (limpeza-billing) pra citar Stripe em vez de Mercado Pago.
   POST /me/plan/confirm segue como endpoint provisório (ENABLE_DEV_BILLING=1)
   até o checkout Stripe real (Fase 5) entrar via webhook.

2) ITEM 1 DA PENDÊNCIA (erros de type-check 'candidates' em
   ServicesManager.tsx) — JÁ NÃO EXISTE.
   Rodei `tsc --noEmit` no projeto web/ agora: zero erros. O componente já
   tem a prop `candidates: Service[]` corretamente tipada e passada em toda
   a árvore (CreateForm, KitFields, etc.). Esse item pode sair da lista.

3) OS 4 BLOQUEADORES DE DEPLOY — TODOS JÁ RESOLVIDOS NO CÓDIGO:
   - migrate deploy: existe script "start:prod:migrate" (prisma migrate
     deploy && node dist/src/main.js) e "migrate:deploy" avulso.
   - JWT_SECRET: src/auth/jwt-secret.ts exige a env e derruba o boot sem
     fallback nenhum (nem em dev).
   - Anthropic lazy init: agent.service.ts só instancia o client Anthropic
     na primeira chamada real (getAnthropic()); sem ANTHROPIC_API_KEY o
     app sobe normal.
   - CPF_HASH_SECRET: src/common/cpf.ts exige a env pra gerar o hash.
   (Só não confirmei se as envs estão de fato preenchidas no Render — isso
   não dá pra ver pelo código, só no dashboard.)

4) ACHADO FORA DO SEU RESUMO — PASTA "Claude.app" NA RAIZ DO REPO
   Existe uma pasta Claude.app/ na raiz do projeto (aparece como untracked
   no git status) que parece ser uma cópia do bundle do aplicativo Claude
   Desktop pra macOS (tem Contents/MacOS, Contents/Frameworks etc.), não é
   código do projeto. Bem provavelmente foi arrastada/copiada sem querer
   pra essa pasta. Não mexi nela — quer que eu remova ou você prefere
   fazer isso manualmente?

5) storage/uploads — CONFIRMA RISCO JÁ CONHECIDO
   uploads/ é armazenamento local em disco; no Render sem disco persistente
   configurado, os arquivos (logo, capa, fotos) somem a cada deploy. Ainda
   não vi nenhuma migração pra S3/Cloudinary no código.

6) O resto do seu resumo (motor de slots, auth JWT+argon2, signup com CPF
   hash, painel completo, página pública em fluxo único, branding,
   follow-up, confirmação SIM/NÃO, trial 14 dias) bate com o código real.
