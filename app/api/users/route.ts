import { NextRequest, NextResponse } from 'next/server'
import { requireRole, canCreateRole } from '@/lib/authz'
import { isRole } from '@/lib/db/schema'
import { getUserByEmail, getUserById, insertUser, listAllUsers, listStudentsOf } from '@/lib/users'

const normalizeEmail = (e: string) => e.trim().toLowerCase()
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

// ─── GET /api/users — listar según rol (filtro SERVER-SIDE) ──────────────────
// admin → todos; profesor → SOLO sus alumnos; alumno → 403.
// No se acepta ningún parámetro del cliente: el alcance lo decide el rol de la sesión.
export async function GET() {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const me = gate.session.user

  const users = me.role === 'admin'
    ? await listAllUsers()
    : await listStudentsOf(me.id) // profesor: WHERE teacher_id = su id, sin forma de ampliarlo

  return NextResponse.json({ users })
}

// ─── POST /api/users — crear usuario (registro por invitación) ────────────────
export async function POST(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })
  const creator = gate.session.user
  const creatorRole = creator.role! // requireRole ya garantizó admin|profesor

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  // Mass-assignment cerrado: SOLO se leen estos tres campos.
  const { email: emailRaw, role, teacherId: teacherIdIn } = body as Record<string, unknown>

  // email
  if (typeof emailRaw !== 'string' || !isValidEmail(emailRaw.trim())) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }
  const email = normalizeEmail(emailRaw)

  // role: dentro del enum y permitido para el rol del creador (server-side)
  if (!isRole(role)) return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
  if (!canCreateRole(creatorRole, role)) {
    return NextResponse.json({ error: 'No autorizado a crear ese rol' }, { status: 403 })
  }

  // teacherId: solo aplica a alumno
  let teacherId: string | null = null
  if (role === 'alumno') {
    if (creatorRole === 'profesor') {
      teacherId = creator.id // FORZADO a sí mismo — se ignora lo que venga en el body
    } else if (teacherIdIn != null) {
      // admin: puede asignar un profesor existente, o dejar null
      if (typeof teacherIdIn !== 'string') return NextResponse.json({ error: 'teacherId inválido' }, { status: 400 })
      const teacher = await getUserById(teacherIdIn)
      if (!teacher || teacher.role !== 'profesor') {
        return NextResponse.json({ error: 'teacherId debe ser un profesor existente' }, { status: 400 })
      }
      teacherId = teacherIdIn
    }
  } else if (teacherIdIn != null) {
    return NextResponse.json({ error: 'teacherId solo aplica a alumnos' }, { status: 400 })
  }

  // Duplicado → 409, NUNCA UPDATE (que nadie "recree" a otro para pisarle el rol).
  if (await getUserByEmail(email)) {
    return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
  }

  try {
    const created = await insertUser({ email, role, teacherId })
    return NextResponse.json(created, { status: 201 })
  } catch (err: unknown) {
    // Carrera: dos altas del mismo email a la vez → el UNIQUE de la DB lo frena.
    const msg = err instanceof Error ? err.message : ''
    if (/duplicate key|unique/i.test(msg)) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
    }
    console.error('[users] insert error:', msg)
    return NextResponse.json({ error: 'No se pudo crear el usuario' }, { status: 500 })
  }
}
