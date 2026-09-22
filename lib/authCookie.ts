// ─── Sesión de Auth.js creada "a mano" para el login con contraseña (F3) ─────
//
// Por qué existe: el provider Credentials de NextAuth v5 NO soporta sesiones en
// base de datos. En vez de tocar lib/auth.ts (y arriesgar el login de Google),
// el login con contraseña crea la sesión EXACTAMENTE como la crea Auth.js tras un
// login de Google: una fila en `session` + la cookie de sesión. Desde ahí, auth(),
// requireRole y signOut() la tratan igual que a cualquier otra.
//
// ESPEJO de Auth.js v5 — verificado en node_modules/@auth/core (ver F3):
//   · lib/init.js ............ session.maxAge = 30 días; generateSessionToken = crypto.randomUUID()
//   · lib/utils/cookie.js .... defaultCookies(secure).sessionToken =
//                               name    `${secure ? '__Secure-' : ''}authjs.session-token`
//                               options { httpOnly: true, sameSite: 'lax', path: '/', secure }
//   · lib/actions/callback ... la cookie lleva `expires = session.expires` (el de la fila)
//   · lib/init.js ............ secure = (url.protocol === 'https:'), con url = createActionURL(…)
//
// ⚠️ tests/lib/auth-cookie.test.ts compara esto contra el `defaultCookies` REAL de
// Auth.js: si una actualización de next-auth cambia el nombre o los atributos, ese
// test se cae antes de que el login con contraseña se rompa en silencio.
import { randomUUID } from 'node:crypto'
import { createActionURL } from '@auth/core'
import { db } from '@/lib/db'
import { sessions } from '@/lib/db/schema'

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/**
 * ¿Cookies seguras (`__Secure-` + `secure`)? Se decide con la MISMA función y los
 * MISMOS argumentos que usa `auth()` al LEER la sesión (next-auth/lib/index.js,
 * getSession). Si lo calculáramos distinto, podríamos escribir `authjs.session-token`
 * mientras auth() busca `__Secure-authjs.session-token`, y la sesión no se vería.
 */
export function shouldUseSecureCookies(headers: Headers): boolean {
  const url = createActionURL(
    'session',
    headers.get('x-forwarded-proto') as string, // idéntico a next-auth: puede venir null
    headers,
    process.env,
    { basePath: '/api/auth' }
  )
  return url.protocol === 'https:'
}

export function sessionCookieName(secure: boolean): string {
  return `${secure ? '__Secure-' : ''}authjs.session-token`
}

export function sessionCookieOptions(secure: boolean, expires: Date) {
  return { httpOnly: true, sameSite: 'lax' as const, path: '/', secure, expires }
}

/** Crea la fila de `session` igual que el adapter: token randomUUID, vence en 30 días. */
export async function createDbSession(userId: string): Promise<{ sessionToken: string; expires: Date }> {
  const sessionToken = randomUUID()
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
  await db.insert(sessions).values({ sessionToken, userId, expires })
  return { sessionToken, expires }
}
