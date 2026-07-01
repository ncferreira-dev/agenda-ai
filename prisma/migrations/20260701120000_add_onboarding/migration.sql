-- Fase 3b: pele visual da página pública + marca de onboarding concluído.
ALTER TABLE "Business" ADD COLUMN "themePreset" TEXT;
ALTER TABLE "Business" ADD COLUMN "onboardedAt" TIMESTAMP(3);

-- Backfill: negócios que já existiam não devem cair no wizard de onboarding.
UPDATE "Business" SET "onboardedAt" = "createdAt" WHERE "onboardedAt" IS NULL;
