-- ============================================================================
-- Avance en clase (2026-11) — migración manual
-- ============================================================================
-- El dato principal de "dónde quedó" es el de la CLASE: el profe le muestra el video al
-- alumno (lo comparte en Zoom). Lo que el alumno mira por su cuenta (assignments.
-- last_position_sec, 0007) queda como dato secundario.
--
-- SOLO CREA una tabla nueva, class_progress: una fila por alumno y video.
--   · student_id / video_id → cascade: si se borra el alumno o el video, la fila se va.
--   · teacher_id            → quién lo mostró (set null si se borra ese usuario).
--   · position_sec / seen_at → dónde quedó y cuándo.
-- No depende de que el video esté asignado: el profe puede mostrar cualquier video.
--
-- SEGURIDAD: idempotente (IF NOT EXISTS), transaccional. Primero PRUEBAS; prod con OK.
-- Verificar con: node drizzle/verify_clase.mjs check
-- Debe coincidir con classProgress de lib/db/schema.ts.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS class_progress (
  student_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES "user"(id) ON DELETE SET NULL,
  position_sec real NOT NULL,
  seen_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, video_id)
);
CREATE INDEX IF NOT EXISTS class_progress_video_idx ON class_progress (video_id);

COMMIT;
