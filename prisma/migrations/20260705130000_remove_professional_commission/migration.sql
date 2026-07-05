-- Remove a comissão por profissional: relatório passa a mostrar só faturamento.
ALTER TABLE "Professional" DROP COLUMN "commissionPercent";
