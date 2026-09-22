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
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { loginThrottle } from '@/lib/db/schema'

export const EMAIL_MAX_FAILS = 5
export const IP_MAX_FAILS = 20
export const WINDOW_MINUTES = 15
export const LOCK_MINUTES = 15

export const emailKey = (normalizedEmail: string) => `email:${normalizedEmail}`
export const ipKey = (ip: string) => `ip:${ip}`

// ── "Olvidé mi contraseña" (F4): contadores PROPIOS, con otro prefijo ──
// Acá lo que se frena no es adivinar contraseñas sino usar la app como bombardeador
// de mails. Cuenta CADA pedido (no solo fallos), por hora:
//   · 3 por email → a nadie le llegan más de 3 mails de reset por hora.
//   · 10 por IP   → una sola máquina no puede disparar mails a muchas casillas.
// Prefijos distintos: pedir resets no bloquea el login, ni al revés.
export const RESET_EMAIL_MAX = 3
export const RESET_IP_MAX = 10
export const RESET_WINDOW_MINUTES = 60
export const RESET_LOCK_MINUTES = 60
export const resetEmailKey = (normalizedEmail: string) => `reset-email:${normalizedEmail}`
export const resetIpKey = (ip: string) => `reset-ip:${ip}`

export type ThrottleWindow = { windowMinutes: number; lockMinutes: number }
const LOGIN_WINDOW: ThrottleWindow = { windowMinutes: WINDOW_MINUTES, lockMinutes: LOCK_MINUTES }

/**
 * Cuenta UN intento y dice si entra dentro del límite — TODO en una sola sentencia.
 *
 * ⚠️ Por qué así (encontrado en la verificación en vivo de F4): la versión anterior
 * preguntaba "¿está bloqueado?" y DESPUÉS, en otra sentencia, sumaba el fallo. Una
 * ráfaga en paralelo pasaba entera la pregunta antes de que nadie sumara: 12 intentos
 * simultáneos contra un límite de 5 se evaluaban los 12 (y el reset mandaba 5 mails
 * con un límite de 3). Contar-y-decidir tiene que ser atómico.
 *
 * INSERT … ON CONFLICT DO UPDATE toma el lock de la fila: los pedidos simultáneos a
 * la MISMA clave se serializan y cada uno recibe su propio número (1, 2, 3…). Solo
 * los que caen dentro del límite (y sin bloqueo vigente) devuelven true.
 *   · Se cuenta ANTES de evaluar (reserva de lugar): una ráfaga no puede colarse.
 *   · Al pasar el límite se bloquea `lockMinutes`; el bloqueo no se estira con más
 *     intentos (solo se pone si no había uno vigente).
 *   · Ventana vencida y sin bloqueo vigente → el contador vuelve a empezar en 1.
 */
export async function hit(key: string, max: number, w: ThrottleWindow = LOGIN_WINDOW): Promise<boolean> {
  const window = sql`make_interval(mins => ${w.windowMinutes})`
  const lock = sql`make_interval(mins => ${w.lockMinutes})`
  const stale = sql`(login_throttle.first_fail_at < now() - ${window}
                     AND (login_throttle.locked_until IS NULL OR login_throttle.locked_until <= now()))`
  const next = sql`CASE WHEN ${stale} THEN 1 ELSE login_throttle.fails + 1 END`

  const res = await db.execute(sql`
    INSERT INTO login_throttle (key, fails, first_fail_at, locked_until)
    VALUES (${key}, 1, now(), NULL)
    ON CONFLICT (key) DO UPDATE SET
      fails         = ${next},
      first_fail_at = CASE WHEN ${stale} THEN now() ELSE login_throttle.first_fail_at END,
      locked_until  = CASE
                        WHEN ${stale} THEN NULL
                        WHEN ${next} > ${max}
                             AND (login_throttle.locked_until IS NULL OR login_throttle.locked_until <= now())
                          THEN now() + ${lock}
                        ELSE login_throttle.locked_until
                      END
    RETURNING fails, (locked_until IS NOT NULL AND locked_until > now()) AS locked
  `)
  const row = (res as unknown as { rows: Array<{ fails: number | string; locked: boolean }> }).rows[0]
  return Number(row.fails) <= max && !row.locked
}

/**
 * Devuelve un lugar reservado por `hit` (login exitoso → la IP). Así el contador de
 * IP sigue midiendo solo FALLOS: 25 alumnos de un aula detrás de una misma IP no se
 * bloquean entre sí por entrar bien.
 */
export async function release(key: string): Promise<void> {
  await db.execute(sql`UPDATE login_throttle SET fails = greatest(fails - 1, 0) WHERE key = ${key}`)
}

/**
 * Login exitoso: se borra el contador del EMAIL. El de la IP NO se toca a
 * propósito — si no, un atacante podría "resetear" su IP entrando a su propia
 * cuenta cada 19 intentos y seguir probando contra las demás.
 */
export async function clearFailures(key: string): Promise<void> {
  await db.delete(loginThrottle).where(eq(loginThrottle.key, key))
}
