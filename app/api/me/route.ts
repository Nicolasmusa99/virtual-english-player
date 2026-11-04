import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getProfile, setUserName } from '@/lib/users'
import { NAME_ERROR, normalizePersonName } from '@/lib/personName'

// ─── /api/me — "Mi perfil" (2026-11) ─────────────────────────────────────────
// GET → { profile }: nombre, mail, foto, usuario, si tiene contraseña y si entra con Google.
// PATCH { name } → cambia SU nombre y apellido.
// SIEMPRE sobre el usuario de la sesión: no hay id en el pedido.
const deny = (status: 401 | 403) => NextResponse.json({ error: status === 401 ? 'No autenticado' : 'No autorizado' }, { status })

export async function GET() {
  const gate = await requireRole('admin', 'profesor', 'alumno')
  if (!gate.ok) return deny(gate.status)
  const profile = await getProfile(gate.session.user.id)
  if (!profile) return deny(401)
  const { googleImage, ...rest } = profile
  return NextResponse.json({ profile: { ...rest, hasGoogleImage: !!googleImage } })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor', 'alumno')
  if (!gate.ok) return deny(gate.status)
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const name = normalizePersonName(body?.name)
  if (!name) return NextResponse.json({ error: NAME_ERROR }, { status: 400 })
  await setUserName(gate.session.user.id, name)
  return NextResponse.json({ name })
}
