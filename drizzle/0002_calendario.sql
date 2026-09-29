-- ============================================================================
-- Calendario de clases — migración manual (fase feat/calendario, C1)
-- ============================================================================
-- SOLO AGREGA: un enum y dos tablas nuevas. No toca ninguna tabla existente ni
-- datos. Mismo criterio que assignments: CREATE puntual, NO `drizzle-kit push`
-- (push compara TODO el esquema y podría proponer cambios ajenos a esta fase).
--
-- SEGURIDAD:
--   · Idempotente: IF NOT EXISTS / DO-EXCEPTION en cada paso.
--   · Transaccional: todo o nada (BEGIN/COMMIT).
--   · Correr PRIMERO contra la base de PRUEBAS; a prod solo con OK explícito.
--   · Verificar con: node drizzle/verify_calendario.mjs
-- Debe coincidir con classStatus / classSeries / classEvents de lib/db/schema.ts.
-- ============================================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE class_status AS ENUM ('scheduled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS class_series (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  weekday       integer NOT NULL,
  start_minute  integer NOT NULL,
  duration_min  integer NOT NULL,
  starts_on     date NOT NULL,
  ends_on       date,
  meet_url      text,
  created_by    uuid REFERENCES "user"(id) ON DELETE SET NULL,
  created_at    timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id          uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  student_id          uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  series_id           uuid REFERENCES class_series(id) ON DELETE CASCADE,
  original_starts_at  timestamp with time zone,
  starts_at           timestamp with time zone NOT NULL,
  duration_min        integer NOT NULL,
  status              class_status NOT NULL DEFAULT 'scheduled',
  meet_url            text,
  created_by          uuid REFERENCES "user"(id) ON DELETE SET NULL,
  created_at          timestamp NOT NULL DEFAULT now(),
  CONSTRAINT class_events_series_original_uq UNIQUE (series_id, original_starts_at)
);

-- Índices para las lecturas de getSchedule (alumno + profe, por fecha).
CREATE INDEX IF NOT EXISTS class_series_student_teacher_idx ON class_series (student_id, teacher_id);
CREATE INDEX IF NOT EXISTS class_events_student_teacher_starts_idx ON class_events (student_id, teacher_id, starts_at);

COMMIT;
