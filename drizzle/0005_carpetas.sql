-- ============================================================================
-- Carpetas (2026-11) — migración manual
-- ============================================================================
-- SOLO AGREGA: dos tablas nuevas (folders, folder_videos) y una columna NULLABLE en
-- assignments (folder_id). No borra ni cambia datos: el material asignado de hoy queda
-- "sin carpeta" (folder_id NULL) y sigue viéndose igual.
--
--   · folders.student_id NULL → carpeta de la biblioteca (admin); con alumno → carpeta
--     de ese alumno (la arma su profe o el admin).
--   · folder_videos: los videos de una carpeta de la biblioteca.
--   · assignments.folder_id: en qué carpeta del alumno está cada video asignado. Borrar la
--     carpeta deja el video sin carpeta (no se lo saca al alumno).
--
-- SEGURIDAD:
--   · Idempotente (IF NOT EXISTS / DO-EXCEPTION). Transaccional (BEGIN/COMMIT).
--   · Correr PRIMERO contra la base de PRUEBAS; a prod solo con OK explícito.
--   · Verificar con: node drizzle/verify_carpetas.mjs check
-- Debe coincidir con folders, folderVideos y assignments.folderId de lib/db/schema.ts.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES "user"(id) ON DELETE SET NULL,
  student_id uuid REFERENCES "user"(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS folders_student_idx ON folders (student_id);

CREATE TABLE IF NOT EXISTS folder_videos (
  folder_id uuid NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  added_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, video_id)
);

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS folder_id uuid;
DO $$ BEGIN
  ALTER TABLE assignments ADD CONSTRAINT assignments_folder_id_folders_id_fk
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
