-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NONE', 'PENDING', 'PAID');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "depositCents" INTEGER,
ADD COLUMN     "holdExpiresAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "stripeSessionId" TEXT;

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "depositCents" INTEGER,
ADD COLUMN     "requireDeposit" BOOLEAN NOT NULL DEFAULT false;
