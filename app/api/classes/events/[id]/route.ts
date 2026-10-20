import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getStudentById } from '@/lib/users'
import { CLASS_ERRORS, isUuid, rowScopeFor } from '@/lib/classAccess'
import { deleteEvent, findTeacherClash, getEvent, updateEvent } from '@/lib/classes'
import { isDateStr, isDurationOk, isPastStart, normalizeZoomRoomUrl, parseTime, zonedToUtc } from '@/lib/classSchedule'
import type { ClassStatus, Role } from '@/lib/db/schema'

// Calendario (C1) — una clase suelta o una excepción.
// PATCH  /api/classes/events/[id]  { date + time?, durationMin?, meetUrl?, status?: 'scheduled' | 'cancelled' }
// DELETE /api/classes/events/[id]  borra la clase suelta, o la excepción (= ese martes
//                                  vuelve a ser como dice el horario fijo).
// Inexistente, de otro profe o del profe anterior del alumno → el MISMO 404.
// Pasarla a una fecha/hora que ya pasó → 400 (si no cambia cuándo es, se deja: p. ej.
// corregir el link o cancelar una clase que ya pasó).
// Si cambia cuándo es o cuánto dura (o se restaura una cancelada) y choca con otra clase
// del profe → 409. Solo cambiar el link o cancelar no chequea.

const err = (status: 400 | 401 | 403 | 404 | 409, msg: string) => NextResponse.json({ error: msg }, { status })
type Ctx = { params: Promise<{ id: string }> }

async function load(id: string, me: { id: string; role: Role | null }) {
  if (!isUuid(id)) return null
  const event = await getEvent(id)
  if (!event) return null
  const scope = rowScopeFor(me, event, await getStudentById(event.studentId))
  return scope.ok ? event : null
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err(400, 'Body inválido')
  const b = body as Record<string, unknown>

  const event = await load((await params).id, gate.session.user)
  if (!event) return err(404, CLASS_ERRORS.classNotFound)

  const patch: { startsAt?: Date; durationMin?: number; status?: ClassStatus; meetUrl?: string | null } = {}
  if ('date' in b || 'time' in b) {
    const minute = parseTime(b.time)
    if (!isDateStr(b.date) || minute === null) return err(400, 'Fecha u hora inválida')
    patch.startsAt = zonedToUtc(b.date, minute)
    if (patch.startsAt.getTime() !== new Date(event.startsAt).getTime() && isPastStart(patch.startsAt)) return err(400, CLASS_ERRORS.pastDate)
  }
  if ('durationMin' in b) {
    if (!isDurationOk(b.durationMin)) return err(400, 'Duración inválida (15 a 240 minutos)')
    patch.durationMin = b.durationMin
  }
  if ('meetUrl' in b) {
    const link = normalizeZoomRoomUrl(b.meetUrl)
    if (!link.ok) return err(400, CLASS_ERRORS.zoomOnly)
    patch.meetUrl = link.url
  }
  if ('status' in b) {
    if (b.status !== 'scheduled' && b.status !== 'cancelled') return err(400, 'Estado inválido')
    patch.status = b.status
  }
  if (Object.keys(patch).length === 0) return err(400, 'Nada para cambiar')

  const startsAt = patch.startsAt ?? new Date(event.startsAt)
  const durationMin = patch.durationMin ?? event.durationMin
  const restored = patch.status === 'scheduled' && event.status === 'cancelled'
  const moved = startsAt.getTime() !== new Date(event.startsAt).getTime() || durationMin !== event.durationMin
  if ((patch.status ?? event.status) === 'scheduled' && (moved || restored) &&
      await findTeacherClash(event.teacherId, [{ startsAt, durationMin }], (c) => c.eventId === event.id)) {
    return err(409, CLASS_ERRORS.overlap)
  }

  const updated = await updateEvent(event.id, patch)
  if (!updated) return err(404, CLASS_ERRORS.classNotFound)
  return NextResponse.json({ event: { id: updated.id } })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')

  const event = await load((await params).id, gate.session.user)
  if (!event) return err(404, CLASS_ERRORS.classNotFound)
  if (!(await deleteEvent(event.id))) return err(404, CLASS_ERRORS.classNotFound)
  return NextResponse.json({ ok: true })
}
