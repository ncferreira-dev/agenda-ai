-- Remove o SINAL DO CLIENTE (pagamento antecipado no ato do agendamento).
-- A assinatura do dono (plan/subscriptionStatus/trialEndsAt) e o pagamento
-- manual (manualPaidAt) NÃO são tocados.

-- Agendamentos presos aguardando o sinal passam a CONFIRMED (não há mais como pagar).
UPDATE "Appointment" SET "status" = 'CONFIRMED' WHERE "paymentStatus" = 'PENDING';

-- Colunas de sinal no Appointment.
ALTER TABLE "Appointment"
  DROP COLUMN "paymentStatus",
  DROP COLUMN "depositCents",
  DROP COLUMN "stripeSessionId",
  DROP COLUMN "paidAt",
  DROP COLUMN "holdExpiresAt";

-- Colunas de sinal no Business.
ALTER TABLE "Business"
  DROP COLUMN "requireDeposit",
  DROP COLUMN "depositCents";

-- Enum do sinal, agora sem uso.
DROP TYPE "PaymentStatus";
