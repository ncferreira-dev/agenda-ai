#!/bin/sh
set -e

# Aplica as migrations pendentes (não-interativo, seguro pra produção) e sobe a
# API. NUNCA usa `migrate dev` aqui. Idempotente: se não há migration pendente,
# `migrate deploy` é no-op.
echo "→ Aplicando migrations (prisma migrate deploy)..."
npx prisma migrate deploy

echo "→ Subindo a API..."
exec node dist/main.js
