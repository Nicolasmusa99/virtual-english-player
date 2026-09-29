import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getStudentById } from '@/lib/users'
import { CLASS_ERRORS, isUuid, rowScopeFor } from '@/lib/classAccess'
import { deleteSeries, getSeries, updateSeries } from '@/lib/classes'
import { isDateStr, isDurationOk, normalizeMeetUrl, seriesToJson } from '@/lib/classSchedule'
import type { Role } from '@/lib/db/schema'

// Calendario (C1) — un horario fijo.
// PATCH  /api/classes/series/[id]  { endsOn?, meetUrl?, durationMin? }
//        Día/hora NO se cambian acá: se termina este horario (endsOn) y se crea otro,
//        así las clases pasadas y sus excepciones quedan como estaban.
// DELETE /api/classes/series/[id]  borra el horario y todas sus excepciones.
// Serie inexistente, de otro profe o del profe anterior del alumno → el MISMO 404.

const err = (status: 400 | 401 | 403 | 404, msg: string) => NextResponse.json({ error: msg }, { status })
type Ctx = { params: Promise<{ id: string }> }

async function load(id: string, me: { id: string; role: Role | null }) {
  if (!isUuid(id)) return null
  const series = await getSeries(id)
  if (!series) return null
  const scope = rowScopeFor(me, series, await getStudentById(series.studentId))
  return scope.ok ? series : null
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')
  const me = gate.session.user

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err(400, 'Body inválido')
  const b = body as Record<string, unknown>
  if ('weekday' in b || 'time' in b || 'startsOn' in b) {
    return err(400, 'Para cambiar el día o la hora, terminá este horario y creá uno nuevo')
  }

  const series = await load((await params).id, me)
  if (!series) return err(404, CLASS_ERRORS.classNotFound)

  const patch: { endsOn?: string | null; meetUrl?: string | null; durationMin?: number } = {}
  if ('endsOn' in b) {
    if (b.endsOn !== null && (!isDateStr(b.endsOn) || b.endsOn < series.startsOn)) return err(400, 'Fecha de fin inválida')
    patch.endsOn = b.endsOn as string | null
  }
  if ('meetUrl' in b) {
    const link = normalizeMeetUrl(b.meetUrl)
    if (!link.ok) return err(400, 'El link tiene que ser de Zoom, Google Meet o Teams (https)')
    patch.meetUrl = link.url
  }
  if ('durationMin' in b) {
    if (!isDurationOk(b.durationMin)) return err(400, 'Duración inválida (15 a 240 minutos)')
    patch.durationMin = b.durationMin
  }
  if (Object.keys(patch).length === 0) return err(400, 'Nada para cambiar')

  const updated = await updateSeries(series.id, patch)
  if (!updated) return err(404, CLASS_ERRORS.classNotFound)
  return NextResponse.json({ series: seriesToJson(updated) })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')

  const series = await load((await params).id, gate.session.user)
  if (!series) return err(404, CLASS_ERRORS.classNotFound)
  if (!(await deleteSeries(series.id))) return err(404, CLASS_ERRORS.classNotFound)
  return NextResponse.json({ ok: true })
}
