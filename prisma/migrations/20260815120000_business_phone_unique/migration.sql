-- Business.phone único: o webhook do WhatsApp descobre o negócio pelo número que
-- recebeu a mensagem (business.phone == número). Sem unicidade, dois negócios com
-- o mesmo número mandariam a conversa pro tenant errado; o índice também elimina
-- o seq scan por mensagem recebida. No Postgres, um índice UNIQUE permite vários
-- NULL, então negócios sem WhatsApp continuam funcionando.
CREATE UNIQUE INDEX "Business_phone_key" ON "Business"("phone");
