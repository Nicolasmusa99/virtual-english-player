-- ============================================================================
-- Horario que se repite en VARIOS días ("martes y jueves") — migración manual (G1)
-- ============================================================================
-- SOLO AGREGA una columna NULLABLE a class_series y la llena con el día que ya
-- tenía cada horario (weekday → {weekday}). No borra ni cambia nada más.
--
-- Compatibilidad: `weekday` se queda (NOT NULL, como siempre) y el código nuevo lo
-- sigue llenando con el primer día de `weekdays`. Así el código VIEJO (si llega a
-- correr durante el deploy) sigue funcionando, y el nuevo lee `weekdays` (o, si
-- estuviera vacío, `weekday`).
--
-- SEGURIDAD:
--   · Idempotente (IF NOT EXISTS / WHERE weekdays IS NULL / DO-EXCEPTION).
--   · Transaccional: todo o nada (BEGIN/COMMIT).
--   · Correr PRIMERO contra la base de PRUEBAS; a prod solo con OK explícito.
--   · Verificar con: node drizzle/verify_class_weekdays.mjs
-- Debe coincidir con classSeries.weekdays de lib/db/schema.ts.
-- ============================================================================

BEGIN;

ALTER TABLE class_series ADD COLUMN IF NOT EXISTS weekdays smallint[];

UPDATE class_series SET weekdays = ARRAY[weekday]::smallint[] WHERE weekdays IS NULL;

DO $$ BEGIN
  ALTER TABLE class_series ADD CONSTRAINT class_series_weekdays_ok
    CHECK (weekdays IS NULL OR (cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
