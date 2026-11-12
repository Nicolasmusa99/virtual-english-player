-- ============================================================================
-- Avance del alumno (2026-11) — migración manual
-- ============================================================================
-- SOLO AGREGA dos columnas a "assignments" (un video asignado a un alumno):
--
--   · last_position_sec: el segundo del video donde el alumno lo dejó. NULL = nunca lo abrió.
--   · last_seen_at: cuándo se guardó ese segundo por última vez.
--
-- El alumno no ve nada nuevo: lo usa el profe (tarjeta del alumno, su material y las marcas
-- en la barra del player).
--
-- SEGURIDAD:
--   · Idempotente (IF NOT EXISTS). Transaccional (BEGIN/COMMIT).
--   · Correr PRIMERO contra la base de PRUEBAS; a prod solo con OK explícito.
--   · Verificar con: node drizzle/verify_avance.mjs check
-- Debe coincidir con assignments.lastPositionSec / lastSeenAt de lib/db/schema.ts.
-- ============================================================================

BEGIN;

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS last_position_sec real;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS last_seen_at timestamp;

COMMIT;
