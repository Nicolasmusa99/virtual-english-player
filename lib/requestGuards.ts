// ─── Guardas de request para las rutas públicas de auth (F3/F4) ──────────────
// Compartidas por /api/auth/password-login y /api/auth/forgot-password: la lógica
// de seguridad vive en UN solo lugar, no duplicada por ruta.
import type { NextRequest } from 'next/server'

/**
 * CSRF: el navegador manda `Origin` en todo POST y una página ajena no lo puede
 * falsificar. Se compara contra el host que ve Auth.js (x-forwarded-host ?? host),
 * así funciona igual en local, preview y producción sin configurar nada.
 * Sin Origin → se rechaza (ningún cliente legítimo nuestro llega sin él).
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return false
  let o: URL
  try {
    o = new URL(origin)
  } catch {
    return false
  }
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  return !!host && o.host === host
}

/** IP del cliente. En Vercel `x-forwarded-for` lo pone la plataforma (primer salto). */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return xff || req.headers.get('x-real-ip')?.trim() || 'unknown'
}
