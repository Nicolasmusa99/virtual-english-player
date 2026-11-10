import { NextRequest, NextResponse } from 'next/server'
import { createSession, getLoginByEmail } from '@/lib/users'
import { dummyHash, normalizeEmail, verifyPassword } from '@/lib/password'
import { isSecureRequest, sessionCookieName, sessionCookieOptions } from '@/lib/sessionCookie'
import { createThrottle } from '@/lib/loginThrottle'

// ─── POST /api/login — entrar con mail y contraseña (2026-11) ────────────────
// { email, password }. Si está bien y la cuenta tiene rol, abre una sesión en la tabla de
// Auth.js y deja su cookie: desde ahí la app la trata igual que una de Google.
// Mail inexistente, contraseña mal, cuenta solo de Google o sin rol → el MISMO 401 y el
// mismo tiempo (no se revela qué mails existen). Muchos intentos fallidos seguidos → 429.
const throttle = createThrottle()
// Además del freno por mail: una misma conexión probando MUCHOS mails distintos (20 fallos → 5 min).
const perIp = createThrottle(20)
const WRONG = 'Mail o contraseña incorrectos.'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const email = normalizeEmail(body?.email)
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password || password.length > 200) return NextResponse.json({ error: WRONG }, { status: 401 })

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
  const wait = Math.max(throttle.blockedFor(email), perIp.blockedFor(ip))
  if (wait > 0) {
    const min = Math.ceil(wait / 60000)
    return NextResponse.json({ error: `Demasiados intentos. Probá de nuevo en ${min} ${min === 1 ? 'minuto' : 'minutos'}.` }, { status: 429 })
  }

  const row = await getLoginByEmail(email)
  const good = await verifyPassword(password, row?.passwordHash ?? (await dummyHash()))
  if (!row || !row.passwordHash || !good || !row.role) {
    throttle.fail(email)
    perIp.fail(ip)
    return NextResponse.json({ error: WRONG }, { status: 401 })
  }
  throttle.ok(email)

  const { sessionToken, expires } = await createSession(row.id)
  const secure = isSecureRequest(req.url, req.headers.get('x-forwarded-proto'))
  const res = NextResponse.json({ ok: true })
  res.cookies.set(sessionCookieName(secure), sessionToken, sessionCookieOptions(secure, expires))
  return res
}
