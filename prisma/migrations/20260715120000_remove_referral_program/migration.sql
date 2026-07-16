-- DropForeignKey
ALTER TABLE "Referral" DROP CONSTRAINT "Referral_referredBusinessId_fkey";

-- DropForeignKey
ALTER TABLE "Referral" DROP CONSTRAINT "Referral_referrerBusinessId_fkey";

-- DropIndex
DROP INDEX "Business_referralCode_key";

-- AlterTable
ALTER TABLE "Business" DROP COLUMN "referralCode",
DROP COLUMN "referralCreditCents",
DROP COLUMN "referredByCode";

-- DropTable
DROP TABLE "Referral";

-- DropEnum
DROP TYPE "ReferralStatus";
