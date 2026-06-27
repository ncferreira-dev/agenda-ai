-- CreateTable
CREATE TABLE "RecurringBlock" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "professionalId" TEXT,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringBlock_businessId_weekday_idx" ON "RecurringBlock"("businessId", "weekday");

-- CreateIndex
CREATE INDEX "RecurringBlock_professionalId_weekday_idx" ON "RecurringBlock"("professionalId", "weekday");

-- AddForeignKey
ALTER TABLE "RecurringBlock" ADD CONSTRAINT "RecurringBlock_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringBlock" ADD CONSTRAINT "RecurringBlock_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;
