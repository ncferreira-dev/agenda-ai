-- Comissão por profissional: percentual inteiro (0–100). Default 0 = sem comissão.
ALTER TABLE "Professional" ADD COLUMN "commissionPercent" INTEGER NOT NULL DEFAULT 0;
