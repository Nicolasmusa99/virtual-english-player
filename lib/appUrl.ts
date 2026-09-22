// ─── URL base de la app (F1) ─────────────────────────────────────────────────
// De acá salen los links que viajan por mail (poner contraseña / reset).
//
// ⚠️ SEGURIDAD — por qué esto NO lee el header Host del request:
// el "host header poisoning" es el ataque clásico contra los links de reset. Si
// el link se armara con `req.headers.host`, un atacante podría pedir un reset
// para la víctima con un Host falso, y el mail le llegaría a la víctima con un
// link apuntando al servidor del atacante: si lo clickea, le entrega el token.
// Por eso la URL base sale SIEMPRE de variables de entorno del servidor, que el
// cliente no puede influir.

/** Saca la barra final para poder concatenar rutas sin duplicarla. */
function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/**
 * URL base absoluta de la app, sin barra final. Orden de resolución:
 *   1. APP_BASE_URL                          — override explícito (gana siempre).
 *   2. AUTH_URL                              — la que ya usa NextAuth, si está.
 *   3. VERCEL_PROJECT_PRODUCTION_URL         — solo en producción: el dominio estable
 *                                              (no la URL del deploy, que cambia).
 *   4. VERCEL_URL                            — la URL de ESTE deploy (preview).
 *   5. http://localhost:3000                 — desarrollo local.
 */
export function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL || process.env.AUTH_URL
  if (explicit) return normalize(explicit)

  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${normalize(process.env.VERCEL_PROJECT_PRODUCTION_URL)}`
  }
  if (process.env.VERCEL_URL) return `https://${normalize(process.env.VERCEL_URL)}`

  return 'http://localhost:3000'
}

/** Arma una URL absoluta de la app a partir de una ruta (`/set-password?...`). */
export function appUrl(path: string): string {
  return `${appBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
}
