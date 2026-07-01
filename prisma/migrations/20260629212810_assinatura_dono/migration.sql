-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('START', 'PRO', 'ULTRA');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "plan" "Plan",
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- Backfill: negócios existentes entram em teste grátis de 14 dias a partir do
-- cadastro (createdAt). Sem cobrança ainda; só estado inicial p/ a Fase 5.
UPDATE "Business"
SET "trialEndsAt" = "createdAt" + INTERVAL '14 days'
WHERE "trialEndsAt" IS NULL;
