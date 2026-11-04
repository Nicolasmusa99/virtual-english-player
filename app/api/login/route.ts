import { NextRequest, NextResponse } from 'next/server'
import { createSession, getLoginByUsername } from '@/lib/users'
import { dummyHash, normalizeUsername, verifyPassword } from '@/lib/password'
import { isSecureRequest, sessionCookieName, sessionCookieOptions } from '@/lib/sessionCookie'
import { createThrottle } from '@/lib/loginThrottle'

// ─── POST /api/login — entrar con usuario y contraseña (2026-11) ─────────────
// { username, password }. Si está bien y la cuenta tiene rol, abre una sesión en la tabla
// de Auth.js y deja su cookie: desde ahí la app la trata igual que una de Google.
// Usuario inexistente, contraseña mal o cuenta sin rol → el MISMO 401 y el mismo tiempo
// (no se revela qué usuarios existen). Muchos intentos fallidos seguidos → 429 un rato.
const throttle = createThrottle()
const WRONG = 'Usuario o contraseña incorrectos.'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const username = normalizeUsername(body?.username)
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!username || !password || password.length > 200) return NextResponse.json({ error: WRONG }, { status: 401 })

  const wait = throttle.blockedFor(username)
  if (wait > 0) {
    const min = Math.ceil(wait / 60000)
    return NextResponse.json({ error: `Demasiados intentos. Probá de nuevo en ${min} ${min === 1 ? 'minuto' : 'minutos'}.` }, { status: 429 })
  }

  const row = await getLoginByUsername(username)
  const good = await verifyPassword(password, row?.passwordHash ?? (await dummyHash()))
  if (!row || !row.passwordHash || !good || !row.role) {
    throttle.fail(username)
    return NextResponse.json({ error: WRONG }, { status: 401 })
  }
  throttle.ok(username)

  const { sessionToken, expires } = await createSession(row.id)
  const secure = isSecureRequest(req.url, req.headers.get('x-forwarded-proto'))
  const res = NextResponse.json({ ok: true })
  res.cookies.set(sessionCookieName(secure), sessionToken, sessionCookieOptions(secure, expires))
  return res
}
