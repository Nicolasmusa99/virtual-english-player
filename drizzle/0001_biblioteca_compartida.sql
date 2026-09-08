-- ============================================================================
-- Biblioteca compartida — migración manual (Fase: feat/biblioteca-compartida)
-- ============================================================================
-- POR QUÉ MANUAL Y NO `drizzle-kit push`:
--   El cambio de PK de video_sessions de (video_id) a (video_id, user_id)
--   agrega una columna NOT NULL a una tabla con datos. `push` no sabe
--   backfillear: o falla, o (peor) recrea la tabla y pierde las sesiones
--   existentes. Esta migración hace el backfill en el ORDEN correcto y aborta
--   si algo no cuadra, todo dentro de UNA transacción (BEGIN/COMMIT).
--
-- SEGURIDAD:
--   · Idempotente: se puede correr más de una vez sin romper (IF EXISTS /
--     IF NOT EXISTS / DO-EXCEPTION en cada paso).
--   · Transaccional: si el chequeo del paso 5 falla, ROLLBACK total, la tabla
--     queda como estaba.
--   · Correr PRIMERO contra una branch de preview de Neon, NUNCA contra prod.
-- ============================================================================

BEGIN;

-- 1) Enums de clasificación (idempotente) ------------------------------------
DO $$ BEGIN
  CREATE TYPE shared_type AS ENUM ('pelicula', 'cancion');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE shared_level AS ENUM ('beginner', 'medium', 'advance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Columnas de publicación en videos (NULL = privado). NO destructivo ------
ALTER TABLE videos ADD COLUMN IF NOT EXISTS shared_type  shared_type;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS shared_level shared_level;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS published_at timestamp;

-- 3) video_sessions.user_id: agregar NULLABLE primero (para backfillear) ------
ALTER TABLE video_sessions ADD COLUMN IF NOT EXISTS user_id uuid;

-- 4) BACKFILL: cada sesión existente pertenece al DUEÑO de su video ----------
--    (hoy hay exactamente una sesión por video, la del que lo subió).
UPDATE video_sessions vs
   SET user_id = v.user_id
  FROM videos v
 WHERE vs.video_id = v.id
   AND vs.user_id IS NULL;

-- 5) CHEQUEO DURO: ninguna sesión puede quedar sin user_id -------------------
--    Si quedara alguna (p.ej. sesión huérfana sin video), ABORTA todo.
DO $$
DECLARE huerfanas int;
BEGIN
  SELECT count(*) INTO huerfanas FROM video_sessions WHERE user_id IS NULL;
  IF huerfanas > 0 THEN
    RAISE EXCEPTION
      'Backfill incompleto: % sesiones sin user_id. ROLLBACK.', huerfanas;
  END IF;
END $$;

-- 6) Recién ahora: NOT NULL + FK + cambio de PK ------------------------------
ALTER TABLE video_sessions ALTER COLUMN user_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE video_sessions
    ADD CONSTRAINT video_sessions_user_id_user_id_fk
    FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PK: de (video_id) a (video_id, user_id)
ALTER TABLE video_sessions DROP CONSTRAINT IF EXISTS video_sessions_pkey;
ALTER TABLE video_sessions DROP CONSTRAINT IF EXISTS video_sessions_video_id_pk;
ALTER TABLE video_sessions ADD PRIMARY KEY (video_id, user_id);

COMMIT;

-- ============================================================================
-- Post-condición esperada (verificar con drizzle/verify_biblioteca.mjs):
--   · count(video_sessions) ANTES == count DESPUÉS  (no se pierde ninguna)
--   · toda fila previa tiene user_id = dueño de su video
--   · PK = (video_id, user_id); user_id NOT NULL; FK a "user"(id) ON DELETE CASCADE
--   · videos tiene shared_type / shared_level / published_at (todas NULL)
-- ============================================================================
