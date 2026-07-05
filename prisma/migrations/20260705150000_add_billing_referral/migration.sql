-- Assinatura ativa (datas) + programa de indicação. Feito à mão (o `migrate dev`
-- é interativo). Aplicar com `npm run migrate:deploy`.

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'CONVERTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Business"
  ADD COLUMN "subscribedAt" TIMESTAMP(3),
  ADD COLUMN "launchPricingEndsAt" TIMESTAMP(3),
  ADD COLUMN "currentPeriodEndsAt" TIMESTAMP(3),
  ADD COLUMN "referralCode" TEXT,
  ADD COLUMN "referredByCode" TEXT,
  ADD COLUMN "referralCreditCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Referral" (
  "id" TEXT NOT NULL,
  "referrerBusinessId" TEXT NOT NULL,
  "referredBusinessId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
  "referredDiscountApplied" BOOLEAN NOT NULL DEFAULT false,
  "referrerRewarded" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "convertedAt" TIMESTAMP(3),
  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_referralCode_key" ON "Business"("referralCode");
CREATE UNIQUE INDEX "Referral_referredBusinessId_key" ON "Referral"("referredBusinessId");
CREATE INDEX "Referral_referrerBusinessId_idx" ON "Referral"("referrerBusinessId");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerBusinessId_fkey" FOREIGN KEY ("referrerBusinessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredBusinessId_fkey" FOREIGN KEY ("referredBusinessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
