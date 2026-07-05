# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Backend NestJS (agend.ai). Imagem multi-stage:
#   1) deps    — instala dependências (com dev) e gera o Prisma Client.
#   2) build   — compila TypeScript -> dist/.
#   3) runtime — só o necessário pra rodar: node_modules de produção + dist +
#      prisma/ (migrations e schema, pra rodar `migrate deploy` no start).
#
# O container aplica as migrations e sobe a API via docker-entrypoint.sh.
# ---------------------------------------------------------------------------

FROM node:20-slim AS deps
WORKDIR /app
# openssl é exigido pelo Prisma engine.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Só dependências de produção.
COPY package*.json ./
RUN npm ci --omit=dev

# Prisma Client gerado + schema/migrations (necessários pro migrate deploy).
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma

# Artefato compilado.
COPY --from=build /app/dist ./dist

# Entry: aplica migrations e sobe a API.
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Pasta de uploads gravável pelo usuário não-root (sem S3, as imagens vão pra cá;
# é efêmera — some no restart. Pra persistir, configure S3_BUCKET). Sem isso o
# boot quebra com EACCES ao criar /app/uploads.
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# Roda como usuário não-root.
USER node

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
