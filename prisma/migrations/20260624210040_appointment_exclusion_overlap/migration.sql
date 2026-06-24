-- Garantia de ZERO overbooking no nível do banco, além do recheck transacional.
-- Impede dois agendamentos ATIVOS (PENDING/CONFIRMED) do mesmo profissional que
-- se sobreponham no tempo. tsrange [) casa com a semântica de slot (início
-- inclusivo, fim exclusivo). btree_gist habilita o "=" em professionalId no gist.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_no_overlap"
  EXCLUDE USING gist (
    "professionalId" WITH =,
    tsrange("startAt", "endAt") WITH &&
  )
  WHERE (status IN ('PENDING', 'CONFIRMED'));
