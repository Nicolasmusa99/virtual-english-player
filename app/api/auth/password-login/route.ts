import { NextRequest, NextResponse } from 'next/server'
import {
  createDbSession,
  sessionCookieName,
  sessionCookieOptions,
  shouldUseSecureCookies,
} from '@/lib/authCookie'
import {
  EMAIL_MAX_FAILS,
  IP_MAX_FAILS,
  clearFailures,
  emailKey,
  ipKey,
  lockedUntil,
  registerFailure,
} from '@/lib/loginThrottle'
import { verifyPassword } from '@/lib/password'
import { getUserForLogin } from '@/lib/users'

// ─── POST /api/auth/password-login — entrar con email + contraseña ───────────
//
// Convive con Google SIN tocarlo: lib/auth.ts no se modifica. Esta ruta produce
// exactamente lo mismo que un login de Google — una fila en `session` y la cookie
// de sesión de Auth.js (ver lib/authCookie.ts) — así que auth(), requireRole y
// signOut() la tratan igual, y el rol se sigue leyendo de la base en cada request.
//
// Reglas de seguridad:
//   · Allowlist de Fase 1: sin fila o sin rol → no entra. Esta ruta NUNCA crea usuarios.
//   · Una sola respuesta de error para no-existe / sin-contraseña / contraseña-mal /
//     rol NULL: mismo status, mismo cuerpo y (vía DUMMY_HASH) mismo tiempo.
//   · Fuerza bruta: 5 fallos por email y 20 por IP en 15 min → bloqueo 15 min.
//   · CSRF: el Origin tiene que ser este mismo sitio; la cookie va SameSite=Lax.

const INVALID = 'Email o contraseña incorrectos'
const LOCKED = 'Demasiados intentos. Probá de nuevo en unos minutos.'

// Topes de tamaño ANTES de tocar la base o bcrypt: un body de megas no puede
// convertirse en trabajo caro (bcrypt usa solo 72 bytes, pero convertiría todo).
const MAX_EMAIL = 320
const MAX_PASSWORD = 1024

const noStore = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: noStore })

/**
 * CSRF: el navegador manda `Origin` en todo POST y una página ajena no lo puede
 * falsificar. Se compara contra el host que ve Auth.js (x-forwarded-host ?? host),
 * así funciona igual en local, preview y producción sin configurar nada.
 * Sin Origin → se rechaza (ningún cliente legítimo nuestro llega sin él).
 */
function isSameOrigin(req: NextRequest): boolean {
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
function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return xff || req.headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function POST(req: NextRequest) {
  // 1. CSRF, antes que nada.
  if (!isSameOrigin(req)) return json({ error: 'Solicitud no permitida' }, 403)

  // 2. Forma del body. Estos 400 no dicen nada de ninguna cuenta.
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return json({ error: 'Body inválido' }, 400)
  const { email: emailRaw, password } = body as Record<string, unknown> // mass-assignment cerrado
  if (typeof emailRaw !== 'string' || typeof password !== 'string') {
    return json({ error: 'Body inválido' }, 400)
  }
  if (emailRaw.length > MAX_EMAIL || password.length > MAX_PASSWORD) {
    return json({ error: 'Body inválido' }, 400)
  }
  const email = emailRaw.trim().toLowerCase()

  // 3. ¿Bloqueado? Se chequea el email EXISTA O NO: el bloqueo no delata cuentas.
  const eKey = emailKey(email)
  const iKey = ipKey(clientIp(req))
  if (await lockedUntil([eKey, iKey])) return json({ error: LOCKED }, 429)

  // 4. Verificación. verifyPassword SIEMPRE corre bcrypt: si no hay usuario o no
  //    tiene contraseña, compara contra DUMMY_HASH → el tiempo no delata nada.
  const user = await getUserForLogin(email)
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? null)

  // 5. Allowlist de Fase 1 (fail-closed): además de la contraseña correcta, tiene
  //    que tener rol. Se evalúa DESPUÉS de bcrypt a propósito, para que "contraseña
  //    bien pero sin rol" tarde y responda igual que "contraseña mal".
  if (!user || !passwordOk || !user.role) {
    await registerFailure(eKey, EMAIL_MAX_FAILS)
    await registerFailure(iKey, IP_MAX_FAILS)
    return json({ error: INVALID }, 401)
  }

  // 6. Adentro. Se limpia el contador del email (el de la IP no: ver loginThrottle).
  await clearFailures(eKey)
  const { sessionToken, expires } = await createDbSession(user.id)
  const secure = shouldUseSecureCookies(req.headers)

  const res = json({ ok: true }, 200)
  res.cookies.set(sessionCookieName(secure), sessionToken, sessionCookieOptions(secure, expires))
  return res
}
