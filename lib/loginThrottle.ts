// ─── Freno a la fuerza bruta del login (F3) ──────────────────────────────────
// Dos contadores independientes por intento:
//   · por EMAIL — frena probar mil contraseñas contra UNA cuenta.
//   · por IP    — frena probar pocas contraseñas contra MUCHAS cuentas (spraying).
//
// ⚠️ Anti-enumeración: el contador por email se incrementa EXISTA O NO la cuenta.
// Así el bloqueo ("demasiados intentos") aparece igual para un email inventado que
// para uno real, y no delata qué cuentas hay.
//
// Riesgo aceptado: alguien puede bloquear a propósito a un alumno por 15 minutos
// fallando 5 veces con su email. A esta escala es preferible a no bloquear: la
// ventana es corta y se libera sola (o el admin borra la fila).
import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { loginThrottle } from '@/lib/db/schema'

export const EMAIL_MAX_FAILS = 5
export const IP_MAX_FAILS = 20
export const WINDOW_MINUTES = 15
export const LOCK_MINUTES = 15

export const emailKey = (normalizedEmail: string) => `email:${normalizedEmail}`
export const ipKey = (ip: string) => `ip:${ip}`

/**
 * ¿Alguna de estas claves está bloqueada ahora? Devuelve hasta cuándo (la más
 * lejana), o null si se puede intentar.
 */
export async function lockedUntil(keys: string[]): Promise<Date | null> {
  if (keys.length === 0) return null
  const rows = await db
    .select({ until: loginThrottle.lockedUntil })
    .from(loginThrottle)
    .where(and(inArray(loginThrottle.key, keys), gt(loginThrottle.lockedUntil, new Date())))
  const times = rows.map((r) => r.until?.getTime() ?? 0).filter((t) => t > 0)
  return times.length ? new Date(Math.max(...times)) : null
}

/**
 * Suma un fallo a la clave. UNA sola sentencia (INSERT … ON CONFLICT DO UPDATE):
 * atómica, así dos intentos simultáneos no pueden pisarse el contador y "ganarse"
 * intentos extra. Si la ventana de 15 min ya venció, el contador vuelve a 1.
 * Al llegar al máximo, bloquea por LOCK_MINUTES.
 */
export async function registerFailure(key: string, maxFails: number): Promise<void> {
  const window = sql`make_interval(mins => ${WINDOW_MINUTES})`
  const lock = sql`make_interval(mins => ${LOCK_MINUTES})`
  const expired = sql`login_throttle.first_fail_at < now() - ${window}`
  const nextFails = sql`CASE WHEN ${expired} THEN 1 ELSE login_throttle.fails + 1 END`

  await db.execute(sql`
    INSERT INTO login_throttle (key, fails, first_fail_at, locked_until)
    VALUES (${key}, 1, now(), CASE WHEN 1 >= ${maxFails} THEN now() + ${lock} ELSE NULL END)
    ON CONFLICT (key) DO UPDATE SET
      fails         = ${nextFails},
      first_fail_at = CASE WHEN ${expired} THEN now() ELSE login_throttle.first_fail_at END,
      locked_until  = CASE WHEN ${nextFails} >= ${maxFails}
                           THEN now() + ${lock}
                           ELSE login_throttle.locked_until END
  `)
}

/**
 * Login exitoso: se borra el contador del EMAIL. El de la IP NO se toca a
 * propósito — si no, un atacante podría "resetear" su IP entrando a su propia
 * cuenta cada 19 intentos y seguir probando contra las demás.
 */
export async function clearFailures(key: string): Promise<void> {
  await db.delete(loginThrottle).where(eq(loginThrottle.key, key))
}
