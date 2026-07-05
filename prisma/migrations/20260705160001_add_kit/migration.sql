-- AlterTable: flag de kit
ALTER TABLE "Service" ADD COLUMN     "isKit" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: composição do kit (kit -> serviços membros)
CREATE TABLE "KitItem" (
    "id" TEXT NOT NULL,
    "kitServiceId" TEXT NOT NULL,
    "memberServiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "KitItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KitItem_kitServiceId_memberServiceId_key" ON "KitItem"("kitServiceId", "memberServiceId");

-- CreateIndex
CREATE INDEX "KitItem_kitServiceId_idx" ON "KitItem"("kitServiceId");

-- CreateIndex
CREATE INDEX "KitItem_memberServiceId_idx" ON "KitItem"("memberServiceId");

-- AddForeignKey
ALTER TABLE "KitItem" ADD CONSTRAINT "KitItem_kitServiceId_fkey" FOREIGN KEY ("kitServiceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitItem" ADD CONSTRAINT "KitItem_memberServiceId_fkey" FOREIGN KEY ("memberServiceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
