import { NextRequest, NextResponse } from 'next/server'
import { createSession, getUserByEmail, insertUser } from '@/lib/users'
import { EMAIL_ERROR, hashPassword, normalizeEmail, passwordProblem } from '@/lib/password'
import { NAME_ERROR, normalizePersonName } from '@/lib/personName'
import { isSecureRequest, sessionCookieName, sessionCookieOptions } from '@/lib/sessionCookie'
import { createThrottle } from '@/lib/loginThrottle'
import { SIGNUP_ROLE } from '@/lib/signup'

// ─── POST /api/signup — crear cuenta desde la bienvenida (2026-11) ───────────
// { name, email, password }, los tres obligatorios. Crea un ALUMNO sin profe (el rol
// nunca viene de afuera), abre su sesión y deja la cookie: entra directo. El admin le
// asigna profe después. Para frenar altas en masa: hasta 5 cuentas por IP cada 30 minutos
// (en memoria de cada instancia, como el freno del login).
// El mail NO se verifica: si después alguien entra con Google con ese mail, la contraseña
// se le saca (ver claimPasswordAccountByGoogle en lib/users.ts).
const perIp = createThrottle(5, 30 * 60 * 1000)
const TAKEN = 'Ya hay una cuenta con ese mail. Entrá con ella.'

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
  if (perIp.blockedFor(ip) > 0) return NextResponse.json({ error: 'Se crearon muchas cuentas desde esta conexión. Probá más tarde.' }, { status: 429 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const name = normalizePersonName(body?.name)
  if (!name) return NextResponse.json({ error: NAME_ERROR }, { status: 400 })
  const email = normalizeEmail(body?.email)
  if (!email) return NextResponse.json({ error: EMAIL_ERROR }, { status: 400 })
  const problem = passwordProblem(body?.password)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  if (await getUserByEmail(email)) return NextResponse.json({ error: TAKEN }, { status: 409 })

  let id: string
  try {
    const created = await insertUser({ name, email, role: SIGNUP_ROLE, teacherId: null, passwordHash: await hashPassword(body!.password as string) })
    id = created.id
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (/duplicate key|unique/i.test(msg)) return NextResponse.json({ error: TAKEN }, { status: 409 })
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
