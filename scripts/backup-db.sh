#!/usr/bin/env bash
#
# Backup do Postgres de produção (Neon), encriptado.
#
#   DATABASE_URL=... BACKUP_PASSPHRASE=... ./scripts/backup-db.sh [pasta-destino]
#
# Sai um único arquivo .dump.gpg. O dump em claro é apagado no fim — ele tem
# telefone e e-mail dos clientes dos assinantes, não pode ficar largado no disco
# nem, muito menos, virar artifact público (o repo é público).
#
# Pra restaurar:
#   gpg --decrypt --output restaurado.dump agendai-AAAAMMDD-HHMMSS.dump.gpg
#   pg_restore --clean --if-exists --no-owner --no-acl -d "$DATABASE_URL" restaurado.dump
#
set -euo pipefail

: "${DATABASE_URL:?defina DATABASE_URL (string de conexão do Neon)}"
: "${BACKUP_PASSPHRASE:?defina BACKUP_PASSPHRASE (senha que abre o backup)}"

DESTINO="${1:-backups}"
mkdir -p "$DESTINO"

CARIMBO="$(date -u +%Y%m%d-%H%M%S)"
DUMP="$DESTINO/agendai-$CARIMBO.dump"

# `?schema=public` é parâmetro do Prisma, não do libpq: o pg_dump recusa a URL
# com "invalid URI query parameter". Tira só ele e preserva o resto (sslmode!).
URL_PG="$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*(&|$)/\1/; s/[?&]$//')"

echo "→ pg_dump ($(pg_dump --version))"
pg_dump --format=custom --no-owner --no-acl --file="$DUMP" "$URL_PG"

# Um dump truncado é pior que nenhum: passa despercebido até o dia em que você
# precisa dele. Dois testes antes de confiar no arquivo.
TAMANHO=$(wc -c < "$DUMP" | tr -d ' ')
if [ "$TAMANHO" -lt 5000 ]; then
  echo "✗ dump com só $TAMANHO bytes — banco vazio ou pg_dump falhou pela metade" >&2
  exit 1
fi

# pg_restore --list só lê o índice do arquivo; se ele estiver corrompido, quebra
# aqui e não daqui a seis meses.
TABELAS=$(pg_restore --list "$DUMP" | grep -c 'TABLE DATA' || true)
if [ "$TABELAS" -lt 1 ]; then
  echo "✗ dump não tem nenhuma tabela com dados" >&2
  exit 1
fi

echo "→ encriptando (AES256)"
gpg --symmetric --cipher-algo AES256 --batch --yes \
    --passphrase "$BACKUP_PASSPHRASE" \
    --output "$DUMP.gpg" "$DUMP"

rm -f "$DUMP"

echo "✓ $DUMP.gpg — $(wc -c < "$DUMP.gpg" | tr -d ' ') bytes, $TABELAS tabelas"
