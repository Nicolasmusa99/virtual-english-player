-- ============================================================================
-- "Mi sala de Zoom" — migración manual (fase feat/agenda-g0)
-- ============================================================================
-- SOLO AGREGA una columna NULLABLE a "user" (el link personal de Zoom del profe).
-- No toca datos: todas las filas quedan con zoom_url = NULL (= sin sala cargada).
-- Idempotente (IF NOT EXISTS). Correr PRIMERO en la base de PRUEBAS; a prod solo
-- con OK explícito. Verificar con: node drizzle/verify_zoom_url.mjs
-- Debe coincidir con users.zoomUrl de lib/db/schema.ts.
-- ============================================================================

BEGIN;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS zoom_url text;

COMMIT;
