import { NextRequest, NextResponse } from 'next/server'
import { createSession, getUserByEmail, getUserByUsername, insertUser } from '@/lib/users'
import { hashPassword, normalizeUsername, passwordProblem, USERNAME_ERROR } from '@/lib/password'
import { NAME_ERROR, normalizePersonName } from '@/lib/personName'
import { isSecureRequest, sessionCookieName, sessionCookieOptions } from '@/lib/sessionCookie'
import { createThrottle } from '@/lib/loginThrottle'
import { SIGNUP_ROLE } from '@/lib/signup'

// ─── POST /api/signup — crear cuenta desde la bienvenida (2026-11) ───────────
// { name, username, password, email? }. Crea un ALUMNO sin profe (el rol nunca viene de
// afuera), abre su sesión y deja la cookie: entra directo. El admin le asigna profe
// después. Para frenar altas en masa: hasta 5 cuentas por IP cada 30 minutos (en memoria
// de cada instancia, como el freno del login).
const perIp = createThrottle(5, 30 * 60 * 1000)
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
const TAKEN_USER = 'Ese usuario ya existe. Elegí otro.'
const TAKEN_MAIL = 'Ya hay una cuenta con ese email. Entrá con ella.'

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
  if (perIp.blockedFor(ip) > 0) return NextResponse.json({ error: 'Se crearon muchas cuentas desde esta conexión. Probá más tarde.' }, { status: 429 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const name = normalizePersonName(body?.name)
  if (!name) return NextResponse.json({ error: NAME_ERROR }, { status: 400 })
  const username = normalizeUsername(body?.username)
  if (!username) return NextResponse.json({ error: USERNAME_ERROR }, { status: 400 })
  const problem = passwordProblem(body?.password)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  let email: string | null = null
  if (typeof body?.email === 'string' && body.email.trim()) {
    if (!isValidEmail(body.email.trim())) return NextResponse.json({ error: 'Ese email no es válido (o dejalo vacío).' }, { status: 400 })
    email = body.email.trim().toLowerCase()
  }

  if (await getUserByUsername(username)) return NextResponse.json({ error: TAKEN_USER }, { status: 409 })
  if (email && await getUserByEmail(email)) return NextResponse.json({ error: TAKEN_MAIL }, { status: 409 })

  let id: string
  try {
    const created = await insertUser({ name, email, role: SIGNUP_ROLE, teacherId: null, username, passwordHash: await hashPassword(body!.password as string) })
    id = created.id
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (/duplicate key|unique/i.test(msg)) return NextResponse.json({ error: /username/i.test(msg) ? TAKEN_USER : TAKEN_MAIL }, { status: 409 })
    console.error('[signup] insert error:', msg)
    return NextResponse.json({ error: 'No se pudo crear la cuenta.' }, { status: 500 })
  }
  perIp.fail(ip) // cuenta las altas (no los errores): 5 por IP y después espera

  const { sessionToken, expires } = await createSession(id)
  const secure = isSecureRequest(req.url, req.headers.get('x-forwarded-proto'))
  const res = NextResponse.json({ ok: true }, { status: 201 })
  res.cookies.set(sessionCookieName(secure), sessionToken, sessionCookieOptions(secure, expires))
  return res
}
