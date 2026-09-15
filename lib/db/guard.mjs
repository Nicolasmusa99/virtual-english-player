// ─── Guarda anti-producción (cinturón de seguridad de la DB) ─────────────────
// Objetivo: PROD solo desde el ENTORNO de producción. El sistema se niega a usar
// la base de PRODUCCIÓN desde cualquier entorno que no sea prod (local, preview,
// db:push, seed), sin importar qué credencial haya en los .env.
//
// En JS ESM (no .ts) a propósito: así lo importan los TRES puntos de entrada —
// el runtime (lib/db/index.ts), el config de migraciones (drizzle.config.ts) y
// el seed (scripts/seed-admins.mjs, .mjs que corre con node pelado y no puede
// importar un .ts). tsconfig tiene allowJs + moduleResolution:bundler, así que
// los .ts sí importan este .mjs.
//
// ⚠️⚠️ MANTENIMIENTO: PROD_DB_HOST_MARKER identifica el endpoint Neon de PRODUCCIÓN.
// Si el endpoint de prod CAMBIA (recrear branch, migrar de proyecto Neon, etc.)
// HAY QUE ACTUALIZAR esta constante o la guarda deja de reconocer prod (falla
// abierta para la detección de prod). Vive en código commiteado —NO en los .env—
// justamente para que pegar credenciales o `vercel env pull` no la puedan pisar.
// Reconfirmar su valor cuando se reconstruya el entorno de test.
const PROD_DB_HOST_MARKER = 'ep-falling-bonus'

/** Extrae el host de una connection string de Postgres/Neon, tolerante a fallos. */
function extractHost(url) {
  try {
    return new URL(url).host
  } catch {
    return url.match(/@([^/?]+)/)?.[1] ?? ''
  }
}

/**
 * Aborta si se intenta usar la base de PRODUCCIÓN desde un entorno no-producción.
 *
 * Reglas:
 *   · host NO es prod                     → OK siempre (test/local/lo que sea).
 *   · host es prod + VERCEL_ENV==='production' → OK (prod real; el deploy no se toca).
 *   · host es prod + ALLOW_PROD_DB==='1'  → OK con warning (migración/seed deliberado a prod).
 *   · host es prod + cualquier otra cosa  → THROW (local, preview, db:push, seed…).
 *
 * Señal de entorno: VERCEL_ENV (NO NODE_ENV). NODE_ENV vale 'production' también
 * en preview y en `next build`; VERCEL_ENV vale 'production' SOLO en el deploy de
 * producción real y lo inyecta Vercel (no vive en los .env → no se puede falsear
 * pegando credenciales ni con `vercel env pull`).
 *
 * @param {string | undefined} url  connection string ya resuelta.
 * @param {'runtime'|'migration'|'seed'} context  de dónde viene (para el mensaje).
 */
export function assertDbHostAllowed(url, context) {
  if (!url) return // sin URL no hay a qué conectarse; otro chequeo (`!`) se encarga.

  const host = extractHost(url)
  if (!host.includes(PROD_DB_HOST_MARKER)) return // host no-prod → siempre permitido.

  if (process.env.VERCEL_ENV === 'production') return // prod real → permitido.

  if (process.env.ALLOW_PROD_DB === '1') {
    console.warn(
      `[db-guard] ⚠️ Usando la base de PRODUCCIÓN a propósito (${host}, context=${context}, ` +
        `ALLOW_PROD_DB=1). Asegurate de tener backup.`
    )
    return
  }

  throw new Error(
    `[db-guard] BLOQUEADO: intento de usar la base de PRODUCCIÓN (${host}) desde un entorno ` +
      `no-producción (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'undefined'}, context=${context}). ` +
      `Si es a propósito (migración/seed a prod, con backup), volvé a correr con ALLOW_PROD_DB=1.`
  )
}
