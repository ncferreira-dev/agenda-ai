-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "totalCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "inactiveDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "recurringMinVisits" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "vipMinSpentCents" INTEGER;

-- CreateTable
CREATE TABLE "AppointmentItem" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "sourceServiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentItem_appointmentId_idx" ON "AppointmentItem"("appointmentId");

-- AddForeignKey
ALTER TABLE "AppointmentItem" ADD CONSTRAINT "AppointmentItem_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cada agendamento existente ganha 1 item espelhando seu serviço, e
-- o totalCents passa a valer o preço atual do serviço (estado pré-itens).
INSERT INTO "AppointmentItem" ("id", "appointmentId", "name", "priceCents", "sourceServiceId", "createdAt")
SELECT gen_random_uuid(), a."id", s."name", s."priceCents", s."id", a."createdAt"
FROM "Appointment" a
JOIN "Service" s ON s."id" = a."serviceId";

UPDATE "Appointment" a
SET "totalCents" = s."priceCents"
FROM "Service" s
WHERE s."id" = a."serviceId";
