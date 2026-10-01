import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { getStudentById } from '@/lib/users'
import { CLASS_ERRORS, isUuid, rowScopeFor } from '@/lib/classAccess'
import { deleteSeries, getSeries, splitSeries, updateSeriesAll, type SeriesPatch } from '@/lib/classes'
import {
  dateInTz, isDateStr, isDurationOk, isOccurrence, normalizeWeekdays, normalizeZoomRoomUrl, parseTime,
  planSplit, seriesToJson,
} from '@/lib/classSchedule'
import type { Role } from '@/lib/db/schema'

// Calendario — un horario que se repite (C1; G1: editar/cancelar como Google Calendar).
// PATCH  /api/classes/series/[id]
//   { scope?: 'all' (por defecto) | 'following', occurrence?: ISO (con 'following'),
//     weekdays?, time?, durationMin?, startsOn?, endsOn?, meetUrl? }
//   · 'all'       → cambia el horario entero, también las clases pasadas. Si cambian
//                   días/hora/duración, sus excepciones se descartan (como Google).
//   · 'following' → desde la clase `occurrence`: el horario viejo termina el día
//                   anterior y arranca uno nuevo con lo pedido (desde `startsOn` o el
//                   día de esa clase). Si es la primera clase, es igual a 'all'.
// DELETE /api/classes/series/[id][?scope=following&occurrence=ISO]
//   · sin scope / 'all' → borra el horario y todas sus clases ("Todas las clases").
//   · 'following'       → termina el horario el día anterior ("Esta y las siguientes").
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

// `occurrence` tiene que ser una clase REAL de este horario.
function parseOccurrence(x: unknown, series: Awaited<ReturnType<typeof getSeries>>): Date | null {
  const d = typeof x === 'string' ? new Date(x) : null
  return d && !isNaN(d.getTime()) && series && isOccurrence(series, d) ? d : null
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')
  const me = gate.session.user

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err(400, 'Body inválido')
  const b = body as Record<string, unknown>
  const scope = b.scope ?? 'all'
  if (scope !== 'all' && scope !== 'following') return err(400, "scope tiene que ser 'all' o 'following'")

  const series = await load((await params).id, me)
  if (!series) return err(404, CLASS_ERRORS.classNotFound)

  // Lo que se pide cambiar (validado campo por campo; lo que no viene, queda igual).
  const patch: SeriesPatch & { startsOn?: string } = {}
  if ('weekdays' in b) {
    const days = normalizeWeekdays(b.weekdays)
    if (!days) return err(400, 'Días de la semana inválidos')
    patch.weekdays = days
  }
  if ('time' in b) {
    const m = parseTime(b.time)
    if (m === null) return err(400, 'Hora inválida (HH:MM)')
    patch.startMinute = m
  }
  if ('durationMin' in b) {
    if (!isDurationOk(b.durationMin)) return err(400, 'Duración inválida (15 a 240 minutos)')
    patch.durationMin = b.durationMin
  }
  if ('startsOn' in b) {
    if (!isDateStr(b.startsOn)) return err(400, 'Fecha de inicio inválida')
    patch.startsOn = b.startsOn
  }
  if ('endsOn' in b) {
    if (b.endsOn !== null && !isDateStr(b.endsOn)) return err(400, 'Fecha de fin inválida')
    patch.endsOn = b.endsOn as string | null
  }
  if ('meetUrl' in b) {
    const link = normalizeZoomRoomUrl(b.meetUrl)
    if (!link.ok) return err(400, CLASS_ERRORS.zoomOnly)
    patch.meetUrl = link.url
  }
  if (Object.keys(patch).length === 0) return err(400, 'Nada para cambiar')

  if (scope === 'following') {
    const occ = parseOccurrence(b.occurrence, series)
    if (!occ) return err(400, 'Esa clase no es parte del horario')
    const startsOn = patch.startsOn ?? dateInTz(occ)
    const next = {
      weekdays: patch.weekdays ?? series.weekdays, startMinute: patch.startMinute ?? series.startMinute,
      durationMin: patch.durationMin ?? series.durationMin, startsOn,
      endsOn: 'endsOn' in patch ? patch.endsOn! : series.endsOn,
      meetUrl: 'meetUrl' in patch ? patch.meetUrl! : series.meetUrl,
    }
    if (next.endsOn !== null && next.endsOn < startsOn) return err(400, 'Fecha de fin inválida')
    const plan = planSplit(series, occ, startsOn)
    if (plan.kind === 'split') {
      const created = await splitSeries(series.id, plan.oldEndsOn, plan.cutFrom, {
        ...next, teacherId: series.teacherId, studentId: series.studentId, createdBy: me.id,
      })
      return NextResponse.json({ series: seriesToJson(created!) })
    }
    // Es la primera clase del horario: "esta y las siguientes" = todo el horario.
    const updated = await updateSeriesAll(series.id, { ...next })
    if (!updated) return err(404, CLASS_ERRORS.classNotFound)
    return NextResponse.json({ series: seriesToJson(updated) })
  }

  const startsOn = patch.startsOn ?? series.startsOn
  const endsOn = 'endsOn' in patch ? patch.endsOn! : series.endsOn
  if (endsOn !== null && endsOn < startsOn) return err(400, 'Fecha de fin inválida')
  const updated = await updateSeriesAll(series.id, patch)
  if (!updated) return err(404, CLASS_ERRORS.classNotFound)
  return NextResponse.json({ series: seriesToJson(updated) })
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return err(gate.status, gate.status === 401 ? 'No autenticado' : 'No autorizado')

  const q = new URL(req.url).searchParams
  const scope = q.get('scope') ?? 'all'
  if (scope !== 'all' && scope !== 'following') return err(400, "scope tiene que ser 'all' o 'following'")

  const series = await load((await params).id, gate.session.user)
  if (!series) return err(404, CLASS_ERRORS.classNotFound)

  if (scope === 'following') {
    const occ = parseOccurrence(q.get('occurrence'), series)
    if (!occ) return err(400, 'Esa clase no es parte del horario')
    const plan = planSplit(series, occ)
    if (plan.kind === 'split') {
      await splitSeries(series.id, plan.oldEndsOn, plan.cutFrom)
      return NextResponse.json({ ok: true, endsOn: plan.oldEndsOn })
    }
    // Desde la primera clase: no queda ninguna → se borra el horario.
  }
  if (!(await deleteSeries(series.id))) return err(404, CLASS_ERRORS.classNotFound)
  return NextResponse.json({ ok: true })
}
