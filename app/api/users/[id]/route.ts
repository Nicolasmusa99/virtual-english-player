import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { deleteUser, getPasswordHash, getStudentById, getUserById, setPassword, setUserName, setUserTeacher } from '@/lib/users'
import { hashPassword, passwordProblem } from '@/lib/password'
import { NAME_ERROR, normalizePersonName } from '@/lib/personName'

const isUuid = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)
const notFound = () => NextResponse.json({ error: 'No encontrado' }, { status: 404 })

// ─── PATCH /api/users/[id] — nombre y apellido, o el profe de un alumno ──────
// { name }: admin → cualquier usuario (alumno, profe o admin); profesor → SOLO sus alumnos
// (teacher_id = él). Para un profe, un alumno ajeno, otro rol o un id que no existe dan el
// mismo 404 (no se revela qué hay).
// { teacherId: uuid | null } (2026-11): SOLO el admin, SOLO a un alumno; tiene que ser un
// profe existente (null = sin profe). Se lee uno de los dos por pedido: si viene `name`,
// solo el nombre (cualquier otro campo se ignora).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const me = gate.session.user
  const { id } = await params

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null

  // { password } (2026-11): SOLO el admin, a una cuenta que entra con contraseña. Cierra
  // las sesiones abiertas de esa persona (si alguien la sabía, deja de estar adentro).
  if (body && typeof body === 'object' && 'password' in body && !('name' in body)) {
    if (me.role !== 'admin') return notFound()
    if (!isUuid(id) || !(await getStudentById(id))) return notFound()
    if (!(await getPasswordHash(id))) return NextResponse.json({ error: 'Esta cuenta entra con Google: no tiene contraseña.' }, { status: 400 })
    const problem = passwordProblem(body.password)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    await setPassword(id, await hashPassword(body.password as string), null)
    return NextResponse.json({ id, ok: true })
  }

  if (body && typeof body === 'object' && 'teacherId' in body && !('name' in body)) {
    if (me.role !== 'admin') return notFound()
    const target = isUuid(id) ? await getStudentById(id) : null
    if (!target || target.role !== 'alumno') return notFound()
    const teacherId = body.teacherId
    if (teacherId !== null) {
      const teacher = isUuid(teacherId) ? await getUserById(teacherId) : null
      if (!teacher || teacher.role !== 'profesor') {
        return NextResponse.json({ error: 'teacherId debe ser un profesor existente' }, { status: 400 })
      }
    }
    await setUserTeacher(id, teacherId as string | null)
    return NextResponse.json({ id, teacherId })
  }

  const name = normalizePersonName(body?.name)
  if (!name) return NextResponse.json({ error: NAME_ERROR }, { status: 400 })

  const target = await getStudentById(id)
  const allowed = !!target && (me.role === 'admin' || (target.role === 'alumno' && target.teacherId === me.id))
  if (!allowed) return notFound()

  await setUserName(id, name)
  return NextResponse.json({ id, name })
}

// ─── DELETE /api/users/[id] — borrar una cuenta (2026-11) ────────────────────
// SOLO el admin, y solo cuentas de profe o de alumno (las de admin no: el admin que se
// borra se lleva sus videos de la biblioteca). Nunca la propia. La base borra en cascada
// lo que cuelga de la cuenta y deja sin profe a los alumnos de un profe borrado. Sin la
// fila, el login ya no lo deja entrar.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole('admin')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const me = gate.session.user
  const { id } = await params

  if (id === me.id) return NextResponse.json({ error: 'No podés borrar tu propia cuenta' }, { status: 400 })
  const target = isUuid(id) ? await getStudentById(id) : null
  if (!target) return notFound()
  if (target.role !== 'alumno' && target.role !== 'profesor') {
    return NextResponse.json({ error: 'Desde acá solo se borran cuentas de profes y de alumnos' }, { status: 403 })
  }
  if (!(await deleteUser(id))) return notFound()
  return NextResponse.json({ ok: true })
}
