import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getPasswordHash, setPassword } from '@/lib/users'
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/password'
import { sessionCookieName } from '@/lib/sessionCookie'

// ─── PUT /api/me/password — cambiar SU contraseña (2026-11) ──────────────────
// { current, next }. Solo para cuentas con usuario y contraseña (las de Google no tienen).
// Pide la actual; con la nueva, se cierran sus OTRAS sesiones (esta queda abierta).
export async function PUT(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor', 'alumno')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const id = gate.session.user.id

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const stored = await getPasswordHash(id)
  if (!stored) return NextResponse.json({ error: 'Tu cuenta entra con Google: no tiene contraseña.' }, { status: 400 })
  if (!(await verifyPassword(typeof body?.current === 'string' ? body.current : '', stored))) {
    return NextResponse.json({ error: 'La contraseña actual no es correcta.' }, { status: 400 })
  }
  const problem = passwordProblem(body?.next)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const keep = req.cookies.get(sessionCookieName(true))?.value ?? req.cookies.get(sessionCookieName(false))?.value ?? null
  await setPassword(id, await hashPassword(body!.next as string), keep)
  return NextResponse.json({ ok: true })
}
