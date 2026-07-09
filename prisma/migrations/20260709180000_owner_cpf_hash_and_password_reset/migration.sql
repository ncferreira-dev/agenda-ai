-- Recriação de duas migrations que existiram no commit 3008ce9 mas foram
-- apagadas por engano no commit seguinte (d13b1c1), sem que o schema.prisma
-- fosse revertido junto. Produção nunca aplicou essas mudanças: Owner.cpfHash
-- e PasswordReset não existiam no banco, quebrando GET /me pra qualquer dono
-- (login social ou email/senha).

-- Migra o CPF do dono para "blind index" (LGPD): deixa de guardar o número cru
-- e passa a guardar só um hash determinístico (HMAC), com unicidade.
ALTER TABLE "Owner" DROP COLUMN "cpf";
ALTER TABLE "Owner" ADD COLUMN "cpfHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Owner_cpfHash_key" ON "Owner"("cpfHash");

-- Invalida sessões antigas no reset de senha.
ALTER TABLE "Owner" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_ownerId_idx" ON "PasswordReset"("ownerId");

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
