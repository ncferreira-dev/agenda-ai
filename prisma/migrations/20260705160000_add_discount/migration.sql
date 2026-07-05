-- CreateEnum
CREATE TYPE "DiscountKind" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable: desconto por serviço
ALTER TABLE "Service" ADD COLUMN     "discountKind" "DiscountKind",
ADD COLUMN     "discountValue" INTEGER NOT NULL DEFAULT 0;
