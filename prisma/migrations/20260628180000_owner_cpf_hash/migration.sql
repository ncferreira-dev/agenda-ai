-- Migra o CPF do dono para "blind index" (LGPD): deixa de guardar o número cru
-- e passa a guardar só um hash determinístico (HMAC), com unicidade.
ALTER TABLE "Owner" DROP COLUMN "cpf";
ALTER TABLE "Owner" ADD COLUMN "cpfHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Owner_cpfHash_key" ON "Owner"("cpfHash");
