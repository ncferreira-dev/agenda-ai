-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "followUpSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "profession" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "followUpDays" INTEGER,
ADD COLUMN     "followUpMessage" TEXT;
