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
  hit,
  ipKey,
  release,
} from '@/lib/loginThrottle'
import { verifyPassword } from '@/lib/password'
import { clientIp, isSameOrigin } from '@/lib/requestGuards'
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
//   · Fuerza bruta: 5 intentos fallidos por email y 20 por IP en 15 min → bloqueo
//     15 min. Contados de forma ATÓMICA y antes de evaluar (resiste ráfagas paralelas).
//   · CSRF: el Origin tiene que ser este mismo sitio; la cookie va SameSite=Lax.

const INVALID = 'Email o contraseña incorrectos'
const LOCKED = 'Demasiados intentos. Probá de nuevo en unos minutos.'

// Topes de tamaño ANTES de tocar la base o bcrypt: un body de megas no puede
// convertirse en trabajo caro (bcrypt usa solo 72 bytes, pero convertiría todo).
const MAX_EMAIL = 320
const MAX_PASSWORD = 1024

const noStore = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: noStore })

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

  // 3. Se CUENTA el intento ANTES de evaluarlo, de forma atómica (ver hit): una
  //    ráfaga en paralelo no puede colarse. Primero la IP (si ya está frenada no se
  //    gasta el cupo del email de nadie); después el email, EXISTA O NO la cuenta.
  const eKey = emailKey(email)
  const iKey = ipKey(clientIp(req))
  if (!(await hit(iKey, IP_MAX_FAILS))) return json({ error: LOCKED }, 429)
  if (!(await hit(eKey, EMAIL_MAX_FAILS))) return json({ error: LOCKED }, 429)

  // 4. Verificación. verifyPassword SIEMPRE corre bcrypt: si no hay usuario o no
  //    tiene contraseña, compara contra DUMMY_HASH → el tiempo no delata nada.
  const user = await getUserForLogin(email)
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? null)

  // 5. Allowlist de Fase 1 (fail-closed): además de la contraseña correcta, tiene
  //    que tener rol. Se evalúa DESPUÉS de bcrypt a propósito, para que "contraseña
  //    bien pero sin rol" tarde y responda igual que "contraseña mal".
  if (!user || !passwordOk || !user.role) {
    return json({ error: INVALID }, 401) // el intento ya quedó contado en el paso 3
  }

  // 6. Adentro. Se borra el contador del email y se devuelve el lugar de la IP.
  await clearFailures(eKey)
  await release(iKey)
  const { sessionToken, expires } = await createDbSession(user.id)
  const secure = shouldUseSecureCookies(req.headers)

  const res = json({ ok: true }, 200)
  res.cookies.set(sessionCookieName(secure), sessionToken, sessionCookieOptions(secure, expires))
  return res
}
