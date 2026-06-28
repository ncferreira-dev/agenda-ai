-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "lastDailySummaryAt" TIMESTAMP(3),
ADD COLUMN     "notifyDailySummary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyWhatsApp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ownerEmail" TEXT,
ADD COLUMN     "ownerWhatsApp" TEXT;
