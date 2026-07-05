# Auditoria de prontidão para deploy — agend.ai

**Data:** 2026-07-04
**Método:** `npm run build` (api + web), grep de URLs/segredos/env, leitura dos pontos de init e do fluxo de signup.
**Status:** relatório + correções aplicadas em 2026-07-04 de **todos os itens 1–10**. Nenhum bloqueador ou risco em aberto (pende só o `docker build` real, que não roda nesta máquina).

---

## 🛠️ Correções aplicadas (2026-07-04)

Pacote mínimo para deploy seguro (itens 1–4) resolvido. Build da API segue passando limpo.

- **1 · Migrate em produção — RESOLVIDO.** `package.json` ganhou `migrate:deploy`
  (`prisma migrate deploy`, não-interativo) e `start:prod:migrate`
  (`prisma migrate deploy && node dist/main.js`) como caminho de prod que aplica
  as migrations antes de subir. `prisma:migrate` (dev) e `start:prod` intactos.
- **2 · `JWT_SECRET` — RESOLVIDO.** Novo `src/auth/jwt-secret.ts` com
  `requireJwtSecret()` que FALHA no boot se a env estiver ausente/vazia. Usado em
  `auth.module.ts` e `jwt.strategy.ts`; os fallbacks `'dev-secret-troque-isto'`
  foram removidos.
- **3 · Anthropic no boot — RESOLVIDO.** `AgentService` e `SuggestionService`
  passaram a init preguiçoso (`anthropic: Anthropic | null` + `getAnthropic()`),
  instanciando só na 1ª chamada e lançando `ServiceUnavailableException` clara se
  faltar a chave. O app sobe sem `ANTHROPIC_API_KEY`; a sugestão degrada pro preset.
- **4 · `CPF_HASH_SECRET` — RESOLVIDO.** Segue obrigatório; mensagem de erro agora
  deixa explícito que é forte e DEFINITIVO. Documentado no `.env.example`.
- **Envs de produção documentadas.** `.env.example` (api) e `web/.env.local.example`
  passaram a listar as obrigatórias (`DATABASE_URL`, `JWT_SECRET`, `CPF_HASH_SECRET`,
  `WEB_ORIGIN`, `PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_ORIGIN`); placeholders de segredo
  agora vêm vazios (cobre também o item 8).
- **5 · Artefato/pipeline de deploy — RESOLVIDO.** `Dockerfile` multi-stage
  (deps → build → runtime, usuário não-root, Prisma Client + migrations embarcados)
  + `docker-entrypoint.sh` que roda `prisma migrate deploy` e então sobe a API +
  `.dockerignore` + `docker-compose.prod.yml` de exemplo (Postgres com healthcheck,
  API com env obrigatórias e volume de uploads).
- **6 · `uploads/` em disco efêmero — RESOLVIDO.** Novo `StorageService` plugável
  (`src/storage/`): sem env → disco local (dev); com `S3_BUCKET` (+ credenciais) →
  object storage S3-compatível (S3/R2/Supabase/MinIO), persistente e multi-instância.
  Upload passou a `memoryStorage` + `storage.put()`; `main.ts` só serve `/uploads`
  no modo local. Envs `S3_*` documentadas no `.env.example`.
- **7 · Fallback silencioso p/ localhost — RESOLVIDO.** Novo `src/common/env.ts`
  com `requiredInProd()`: em produção a app FALHA no boot (erro claro) em vez de
  cair em `localhost`. Aplicado a `WEB_ORIGIN` (sempre) e `PUBLIC_API_URL` (só
  quando de fato usada: upload em disco local ou Google OAuth ligado). Em dev,
  mantém o fallback com aviso.
- **9 · CORS de origem única — RESOLVIDO.** `main.ts` usa `corsOrigins()`, que
  valida `WEB_ORIGIN` em produção e aceita **várias origens** separadas por
  vírgula (ex.: `https://app.agend.ai,https://agend.ai`).
- **10 · Dedupe do webhook em memória — RESOLVIDO.** Novo model `ProcessedWebhook`
  (migration `20260704160000`) com `providerMessageId` como PK. O controller
  reserva a mensagem via insert e trata `P2002` como duplicata. Sobrevive a
  restart e funciona multi-instância (o `Set` em memória não fazia nenhum dos dois).

**Operação:** em prod, defina `JWT_SECRET`/`CPF_HASH_SECRET` (e, recomendado, o
storage `S3_*`) antes do primeiro boot/cadastro. O deploy via Docker aplica as
migrations sozinho (entrypoint); fora do Docker, rode `npm run migrate:deploy`
(ou use `start:prod:migrate`).

---

## ✅ O que está OK (não bloqueia)

- **Builds passam limpos.** Backend `nest build` → exit 0. Web `next build` → exit 0, 25 rotas geradas, type-check sem erros.
- **Erro do `cpf` no ProfileForm: já resolvido** (commit `9226cb2`). Usa `owner.hasCpf` e trata o CPF como write-only. Não aparece mais no type-check.
- **Nenhum segredo versionado.** `.env` e `web/.env.local` **não** estão no Git — só os `*.example`. `.gitignore` cobre `.env`, `.env.local`, `dist/`, `.next/`, `uploads/`.
- **Migrations: 23, todas commitadas**, tree do git limpo. Inclui a exclusion constraint `btree_gist` anti-overbooking.
- **Cookies do painel bem configurados:** `httpOnly`, `sameSite: lax`, `secure: NODE_ENV === 'production'` (login, register e OAuth).
- **Degradação graciosa boa** em Stripe, Web Push (VAPID), Google OAuth, SMTP e no *envio* de WhatsApp — todos com init preguiçoso ou checagem de env antes de usar.

---

## 🔴 BLOQUEADORES (resolver antes de subir)

### 1. Sem `prisma migrate deploy` no fluxo de produção
`package.json` só tem `prisma:migrate` = `prisma migrate dev` (interativo, cria migration, **dev-only**). Não existe script `migrate deploy`, nem Dockerfile, nem pipeline. Em prod é preciso `prisma migrate deploy` (não-interativo, só aplica o que já existe). Hoje não há caminho seguro para aplicar as migrations no deploy.

### 2. `JWT_SECRET` com fallback hardcoded
`src/auth/auth.module.ts` e `src/auth/strategies/jwt.strategy.ts` caem em `'dev-secret-troque-isto'` se a env não estiver setada. Se subir sem `JWT_SECRET`, **qualquer um forja um token e assume qualquer tenant** — fura o isolamento multi-tenant (Regra de Ouro nº 1). O `.env.example` ainda traz o placeholder "troque-isto". Precisa: env obrigatória + falhar no boot se ausente.

---

## 🟠 RISCOS ALTOS

### 3. Boot pode quebrar sem `ANTHROPIC_API_KEY`
`AgentService` e `SuggestionService` fazem `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` no construtor (providers singleton, instanciados no boot). Se a var estiver **ausente** (`undefined`), o SDK lança na subida e derruba a app inteira — contrariando a intenção documentada ("roda sem chave"). Se estiver **vazia (`""`, como no `.example`)** ela boota e só falha na chamada. Ou seja: funciona por acidente. Deveria ter init preguiçoso/guard como Stripe e Push já têm.

### 4. `CPF_HASH_SECRET` obrigatório e placeholder no exemplo
`hashCpf()` **lança** se a var não existir → cadastro de profissional com CPF quebra. O `.env.example` traz "troque-isto"; e a própria nota diz *não trocar depois* (muda os hashes já gravados). Precisa definir um segredo forte e definitivo **antes do primeiro cadastro** em prod.

### 5. Sem artefato/pipeline de deploy
Só há `docker-compose.yml` de Postgres **local**. Existe `start:prod` (`node dist/main.js`), mas nada orquestra `migrate deploy` → `seed` → `start`. Falta Dockerfile/procfile/CI.

### 6. `uploads/` em disco local
Via `useStaticAssets`. Em deploy efêmero (container/Heroku) as imagens de logo/capa somem a cada restart. Precisa storage persistente (S3/volume).

---

## 🟡 RISCOS MENORES

### 7. URLs "hardcoded" são todas `env ?? 'localhost'`
Nenhuma é literal fixa — todas leem env com fallback:
- Backend: `WEB_ORIGIN`, `PUBLIC_API_URL`, `PORT` (main.ts, stripe, uploads, auth, google.strategy).
- Web: `NEXT_PUBLIC_API_BASE`, `API_BASE`, `NEXT_PUBLIC_SITE_ORIGIN`.

Não bloqueiam **se as envs forem setadas em prod**. O risco é o fallback silencioso: esquecer de setar → cai em `localhost` e falha de forma difícil de diagnosticar.

### 8. `NEXT_PUBLIC_SITE_ORIGIN` não está no `web/.env.local.example`
É usado em `painel/page`, `divulgar` e `aparencia` para montar o link público. Sem setar, os links apontam para `localhost:3001`. Documentar no exemplo.

### 9. CORS de origem única, sem `credentials`
`enableCors({ origin: WEB_ORIGIN ?? 'localhost:3001' })`. OK para o modelo atual (os cookies são setados server-side pelos route handlers do Next, não pelo browser direto na API), mas confirme que `WEB_ORIGIN` aponta para o domínio real de produção.

### 10. Dedupe do webhook WhatsApp é em memória (`Set`)
Some no restart e não funciona multi-instância → mensagens reprocessadas. O próprio código já anota "troque por Redis/tabela". Não bloqueia o MVP.

---

## Signup do dono (Fase 1) — ✅ completo e funcional

Fluxo inteiro presente e íntegro: página `/painel/registro` (estática) → proxy route handler → `POST /auth/register` no backend → validações (email, senha ≥8, nome/negócio) → checagem amigável de email + backstop `@unique`/P2002 → **transação** criando `Business` + `Owner` com `passwordHash` **argon2**, slug único, `TRIALING` + `trialEndsAt` → JWT em cookie `httpOnly`+`secure(prod)`. Sem CPF no cadastro leve, com `serviceMode`/endereço/link condicionais. Build gera a rota sem erro.

---

## Resumo da priorização

| # | Item | Classe | Situação |
|---|------|--------|----------|
| 1 | Sem `migrate deploy` no fluxo de prod | 🔴 Bloqueador | ✅ Resolvido |
| 2 | `JWT_SECRET` com fallback dev hardcoded | 🔴 Bloqueador | ✅ Resolvido |
| 3 | Boot quebra sem `ANTHROPIC_API_KEY` ausente | 🟠 Alto | ✅ Resolvido |
| 4 | `CPF_HASH_SECRET` obrigatório + placeholder | 🟠 Alto | ✅ Resolvido |
| 5 | Sem Dockerfile/pipeline de deploy | 🟠 Alto | ✅ Resolvido |
| 6 | `uploads/` em disco efêmero | 🟠 Alto | ✅ Resolvido |
| 7 | Envs com fallback silencioso p/ localhost | 🟡 Menor | ✅ Resolvido (fail-fast em prod) |
| 8 | `NEXT_PUBLIC_SITE_ORIGIN` fora do exemplo | 🟡 Menor | ✅ Resolvido |
| 9 | Confirmar `WEB_ORIGIN` de prod no CORS | 🟡 Menor | ✅ Resolvido (multi-origem + validação) |
| 10 | Dedupe do webhook em memória | 🟡 Menor | ✅ Resolvido (tabela `ProcessedWebhook`) |

**Todos os itens 1–10 resolvidos.** Só resta rodar o `docker build` real numa
máquina com Docker pra validar a imagem de ponta a ponta (o build do backend,
`prisma validate` e a simulação da stage de runtime já passam).
