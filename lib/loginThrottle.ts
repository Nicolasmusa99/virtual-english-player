// Frena a quien prueba contraseñas (2026-11). Puro. Tests: tests/lib/login-throttle.test.ts.
// En memoria de cada instancia del servidor: no es un muro (en Vercel puede haber varias),
// pero corta el "probar mil seguidas" contra un mismo usuario.
export const MAX_FAILS = 5
export const LOCK_MS = 5 * 60 * 1000

type Entry = { fails: number; until: number }

export function createThrottle(max = MAX_FAILS, lockMs = LOCK_MS) {
  const map = new Map<string, Entry>()
  return {
    /** ms que falta para poder volver a probar (0 = puede). */
    blockedFor(key: string, now = Date.now()): number {
      const e = map.get(key)
      if (!e || e.until <= now) return 0
      return e.until - now
    },
    fail(key: string, now = Date.now()): void {
      const fails = (map.get(key)?.fails ?? 0) + 1
      map.set(key, fails >= max ? { fails: 0, until: now + lockMs } : { fails, until: 0 })
      void now
      if (map.size > 5000) map.delete(map.keys().next().value as string)
    },
    ok(key: string): void { map.delete(key) },
  }
}
