-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "reminderHoursBefore" INTEGER NOT NULL DEFAULT 24;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "email" TEXT;
