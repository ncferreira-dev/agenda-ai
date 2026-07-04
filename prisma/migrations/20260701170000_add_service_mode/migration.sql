-- Tipo de atendimento (presencial/remoto/híbrido) por negócio + campo preparado por serviço.
CREATE TYPE "ServiceMode" AS ENUM ('PRESENCIAL', 'REMOTO', 'HIBRIDO');

ALTER TABLE "Business" ADD COLUMN "serviceMode" "ServiceMode" NOT NULL DEFAULT 'PRESENCIAL';
ALTER TABLE "Business" ADD COLUMN "meetingUrl" TEXT;

ALTER TABLE "Service" ADD COLUMN "serviceMode" "ServiceMode";
