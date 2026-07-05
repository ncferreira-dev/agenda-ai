-- Dedupe persistente de webhooks do WhatsApp (substitui o Set em memória).
CREATE TABLE "ProcessedWebhook" (
    "providerMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("providerMessageId")
);

CREATE INDEX "ProcessedWebhook_createdAt_idx" ON "ProcessedWebhook"("createdAt");
