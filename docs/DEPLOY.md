# Guia de deploy — agend.ai

Passo a passo pra colocar no ar. O código já está pronto (auditoria 1–10 resolvida).
O que falta é **infraestrutura** — decisões que só você toma. Comece pela decisão 1.

---

## Decisão 1 — Onde hospedar

Você precisa de **dois serviços**: um Postgres e o backend (Node). Recomendação por
facilidade (mais fácil → mais controle):

| Opção | Bom pra | Link |
|-------|---------|------|
| **Railway** (recomendado) | Sobe Postgres + backend a partir do `Dockerfile`, injeta `DATABASE_URL` sozinho, roda as migrations no start (nosso entrypoint). | https://railway.app |
| **Render** | Parecido, com free tier. | https://render.com |
| **VPS (Hetzner/DigitalOcean)** | Mais controle e mais barato em escala, mais trabalho manual. | https://www.digitalocean.com |

O frontend (`web/`, Next.js) pode ir na **Vercel** (https://vercel.com) — feito pra Next.

---

## Passo a passo (rota Railway)

1. **Crie a conta** em https://railway.app.
2. **New Project → Deploy from GitHub** (suba este projeto num repositório GitHub antes)
   ou use o **Railway CLI** pra subir a pasta.
3. **Add → Database → PostgreSQL.** O Railway cria a `DATABASE_URL` automaticamente.
4. No serviço do backend, aba **Variables**, defina (copie do seu `.env`):
   - `DATABASE_URL` → referencie a do Postgres do Railway (`${{Postgres.DATABASE_URL}}`)
   - `JWT_SECRET` → (o que geramos)
   - `CPF_HASH_SECRET` → (o que geramos — **definitivo**)
   - `WEB_ORIGIN` → URL do frontend (ex.: `https://agendai.vercel.app`)
   - `PUBLIC_API_URL` → URL pública deste backend (o Railway te dá)
   - `NODE_ENV=production`
   - **Recomendado (imagens):** `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
     (+ `S3_ENDPOINT`/`S3_REGION` conforme o provedor). Veja Decisão 2.
5. O deploy usa o `Dockerfile`. O `docker-entrypoint.sh` roda `prisma migrate deploy`
   sozinho antes de subir a API — não precisa fazer nada manual.
6. **Frontend na Vercel:** importe a pasta `web/`, defina `NEXT_PUBLIC_API_BASE`,
   `API_BASE` (= URL do backend) e `NEXT_PUBLIC_SITE_ORIGIN` (= URL do frontend).

---

## Decisão 2 — Storage das imagens (logo/capa)

Sem isso as imagens somem quando o container reinicia. Escolha um bucket
S3-compatível e preencha as `S3_*`:

| Provedor | Observação | Link |
|----------|------------|------|
| **Cloudflare R2** (recomendado) | Sem taxa de saída; use `S3_ENDPOINT`. | https://developers.cloudflare.com/r2 |
| **Supabase Storage** | Fácil se já usar Supabase. | https://supabase.com/docs/guides/storage |
| **AWS S3** | Padrão; não precisa de `S3_ENDPOINT`. | https://aws.amazon.com/s3 |

---

## (Opcional) Validar a imagem Docker localmente antes

Só se quiser testar no seu Mac antes de subir. Precisa instalar o Docker:

1. Instale o **Docker Desktop**: https://www.docker.com/products/docker-desktop
   (ou `brew install --cask docker`) e **abra o app** uma vez.
2. Confirme: `docker version`
3. Build: `docker build -t agendai-api .`
4. Subir tudo (usa o `.env` ao lado): `docker compose -f docker-compose.prod.yml up -d --build`

Isso é **opcional** — Railway/Render fazem o build do Dockerfile no servidor.

---

## Checklist final antes de abrir pro público

- [ ] `JWT_SECRET` e `CPF_HASH_SECRET` definidos (o `CPF_HASH_SECRET` nunca muda depois).
- [ ] `DATABASE_URL` apontando pro Postgres de produção.
- [ ] `WEB_ORIGIN` e `PUBLIC_API_URL` com os domínios reais (a API falha no boot se faltarem).
- [ ] `S3_BUCKET` configurado (senão logos/capas somem no restart).
- [ ] Migrations aplicadas (automático via entrypoint, ou `npm run migrate:deploy`).
- [ ] `.env` **não** versionado (já está no `.gitignore`).
</content>
