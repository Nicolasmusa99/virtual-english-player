// @vitest-environment node
// Calendario (C1; G1: varios días, alcance como Google, solo Zoom) — rutas del PROFE: /api/classes, /api/classes/series[/id], /api/classes/events[/id].
// Corren REALES requireRole, lib/classAccess (quién puede qué) y lib/classSchedule
// (validación y fechas). Se mockean solo la sesión, getStudentById y la capa de datos.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  auth: vi.fn(), getStudentById: vi.fn(), getZoomUrl: vi.fn(),
  getSchedule: vi.fn(), listActiveSeries: vi.fn(), createSeries: vi.fn(), getSeries: vi.fn(),
  updateSeriesAll: vi.fn(), splitSeries: vi.fn(), deleteSeries: vi.fn(), createSingleClass: vi.fn(), upsertException: vi.fn(),
  getEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: m.auth }))
vi.mock('@/lib/users', () => ({ getStudentById: m.getStudentById, getZoomUrl: m.getZoomUrl }))
vi.mock('@/lib/classes', () => ({
  getSchedule: m.getSchedule, listActiveSeries: m.listActiveSeries, createSeries: m.createSeries, getSeries: m.getSeries,
  updateSeriesAll: m.updateSeriesAll, splitSeries: m.splitSeries, deleteSeries: m.deleteSeries, createSingleClass: m.createSingleClass,
  upsertException: m.upsertException, getEvent: m.getEvent, updateEvent: m.updateEvent, deleteEvent: m.deleteEvent,
}))

import { GET as listClasses } from '@/app/api/classes/route'
import { POST as createSeriesRoute } from '@/app/api/classes/series/route'
import { PATCH as patchSeries, DELETE as deleteSeriesRoute } from '@/app/api/classes/series/[id]/route'
import { POST as createEventRoute } from '@/app/api/classes/events/route'
import { PATCH as patchEvent, DELETE as deleteEventRoute } from '@/app/api/classes/events/[id]/route'

const PA = 'aaaaaaaa-0000-4000-8000-00000000000a'
const PB = 'bbbbbbbb-0000-4000-8000-00000000000b'
const ST_A = 'cccccccc-0000-4000-8000-00000000000c' // alumno del profe A
const SER = 'dddddddd-0000-4000-8000-00000000000d'
const EVT = 'eeeeeeee-0000-4000-8000-00000000000e'
const NOT_FOUND = { error: 'Clase no encontrada' }

const as = (id: string, role: string | null) => m.auth.mockResolvedValue({ user: { id, role } })
const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest('http://localhost' + url, {
    method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

const SERIES_A = {
  id: SER, teacherId: PA, studentId: ST_A, weekdays: [2], startMinute: 1080, durationMin: 60,
  startsOn: '2026-09-29', endsOn: null, meetUrl: 'https://meet.google.com/abc-defg-hij',
}
const EVENT_A = {
  id: EVT, teacherId: PA, studentId: ST_A, seriesId: null, originalStartsAt: null,
  startsAt: new Date('2026-10-01T20:00:00Z'), durationMin: 60, status: 'scheduled', meetUrl: null,
}

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset()
  m.getStudentById.mockImplementation(async (id: string) =>
    id === ST_A ? { id: ST_A, role: 'alumno', teacherId: PA } : id === PA ? { id: PA, role: 'profesor', teacherId: null } : null)
  m.getSchedule.mockResolvedValue([])
  m.getZoomUrl.mockResolvedValue(null)
  m.listActiveSeries.mockResolvedValue([])
  m.createSeries.mockImplementation(async (d) => ({ id: SER, ...d }))
  m.getSeries.mockImplementation(async (id: string) => (id === SER ? SERIES_A : null))
  m.updateSeriesAll.mockImplementation(async (id, p) => ({ ...SERIES_A, ...p }))
  m.splitSeries.mockImplementation(async (id, end, cut, next) => (next ? { id: 'ffffffff-0000-4000-8000-00000000000f', ...next } : null))
  m.deleteSeries.mockResolvedValue(true)
  m.createSingleClass.mockImplementation(async (d) => ({ id: EVT, ...d }))
  m.upsertException.mockImplementation(async (d) => ({ id: EVT, ...d }))
  m.getEvent.mockImplementation(async (id: string) => (id === EVT ? EVENT_A : null))
  m.updateEvent.mockImplementation(async (id, p) => ({ ...EVENT_A, ...p }))
  m.deleteEvent.mockResolvedValue(true)
})

// ─────────────────────────────────────────────────────────────────────────────
describe('roles: solo profe y admin', () => {
  const calls = () => [
    listClasses(req(`/api/classes?studentId=${ST_A}`)),
    createSeriesRoute(req('/api/classes/series', 'POST', {})),
    patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', {}), ctx(SER)),
    deleteSeriesRoute(req(`/api/classes/series/${SER}`, 'DELETE'), ctx(SER)),
    createEventRoute(req('/api/classes/events', 'POST', {})),
    patchEvent(req(`/api/classes/events/${EVT}`, 'PATCH', {}), ctx(EVT)),
    deleteEventRoute(req(`/api/classes/events/${EVT}`, 'DELETE'), ctx(EVT)),
  ]
  it('sin sesión → 401 en todas', async () => {
    m.auth.mockResolvedValue(null)
    for (const r of await Promise.all(calls())) expect(r.status).toBe(401)
  })
  it('alumno o sin rol → 403 en todas, sin tocar datos', async () => {
    for (const role of ['alumno', null]) {
      as(ST_A, role)
      for (const r of await Promise.all(calls())) expect(r.status).toBe(403)
    }
    for (const f of [m.getStudentById, m.getSchedule, m.createSeries, m.getSeries, m.getEvent]) expect(f).not.toHaveBeenCalled()
  })
})

describe('GET /api/classes — las clases de UN alumno', () => {
  it('profe con su alumno → horarios + clases de ESE par (profe, alumno)', async () => {
    as(PA, 'profesor')
    m.listActiveSeries.mockResolvedValue([SERIES_A])
    m.getSchedule.mockResolvedValue([{
      key: 'k1', seriesId: SER, eventId: null, startsAt: new Date('2026-09-29T21:00:00Z'), durationMin: 60,
      meetUrl: SERIES_A.meetUrl, status: 'scheduled', originalStartsAt: null,
    }])
    const res = await listClasses(req(`/api/classes?studentId=${ST_A}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.series).toEqual([{ id: SER, weekdays: [2], time: '18:00', durationMin: 60, startsOn: '2026-09-29', endsOn: null, meetUrl: SERIES_A.meetUrl }])
    expect(body.classes[0]).toEqual({
      key: 'k1', seriesId: SER, eventId: null, startsAt: '2026-09-29T21:00:00.000Z', durationMin: 60,
      meetUrl: SERIES_A.meetUrl, status: 'scheduled', originalStartsAt: null,
    })
    expect(m.getSchedule.mock.calls[0].slice(0, 2)).toEqual([ST_A, PA])
    expect(body.zoomUrl).toBeNull()
  })
  it('manda "Mi sala de Zoom" del profe de ESE alumno (admin: la del profe, no la suya)', async () => {
    m.getZoomUrl.mockImplementation(async (id: string) => (id === PA ? 'https://us02web.zoom.us/j/1' : 'https://zoom.us/j/admin'))
    as('ad', 'admin')
    const body = await (await listClasses(req(`/api/classes?studentId=${ST_A}`))).json()
    expect(body.zoomUrl).toBe('https://us02web.zoom.us/j/1')
    expect(m.getZoomUrl).toHaveBeenCalledWith(PA)
  })
  it('sin rango: desde hace 2 h y 35 días', async () => {
    as(PA, 'profesor')
    const before = Date.now()
    await listClasses(req(`/api/classes?studentId=${ST_A}`))
    const [, , from, to] = m.getSchedule.mock.calls[0]
    expect(Math.abs(from.getTime() - (before - 2 * 3_600_000))).toBeLessThan(5_000)
    expect(to.getTime() - from.getTime()).toBe(35 * 86_400_000)
  })
  it('profe B con el alumno de A → 403, sin leer clases', async () => {
    as(PB, 'profesor')
    expect((await listClasses(req(`/api/classes?studentId=${ST_A}`))).status).toBe(403)
    expect(m.getSchedule).not.toHaveBeenCalled()
  })
  it('admin → las del profe ACTUAL del alumno', async () => {
    as('ad', 'admin')
    expect((await listClasses(req(`/api/classes?studentId=${ST_A}`))).status).toBe(200)
    expect(m.getSchedule.mock.calls[0].slice(0, 2)).toEqual([ST_A, PA])
  })
  it('sin studentId → 400; no existe / no es alumno → 404; rango inválido → 400', async () => {
    as(PA, 'profesor')
    expect((await listClasses(req('/api/classes'))).status).toBe(400)
    expect((await listClasses(req(`/api/classes?studentId=${PB}`))).status).toBe(404)
    expect((await listClasses(req(`/api/classes?studentId=${PA}`))).status).toBe(404)
    expect((await listClasses(req(`/api/classes?studentId=${ST_A}&from=2026-01-01T00:00:00Z&to=2026-12-01T00:00:00Z`))).status).toBe(400)
  })
})

describe('POST /api/classes/series — horario que se repite', () => {
  const OK = { studentId: ST_A, weekdays: [2], time: '18:00', durationMin: 60, startsOn: '2026-09-29', meetUrl: 'https://zoom.us/j/1' }
  const DATA = {
    teacherId: PA, studentId: ST_A, weekdays: [2], startMinute: 1080, durationMin: 60,
    startsOn: '2026-09-29', endsOn: null, meetUrl: 'https://zoom.us/j/1', createdBy: PA,
  }

  it('crea a nombre del profe (teacher_id del SERVIDOR, no del body)', async () => {
    as(PA, 'profesor')
    const res = await createSeriesRoute(req('/api/classes/series', 'POST', { ...OK, teacherId: PB, createdBy: PB, id: 'x' }))
    expect(res.status).toBe(201)
    expect(m.createSeries).toHaveBeenCalledWith(DATA, undefined)
    expect((await res.json()).series).toMatchObject({ weekdays: [2], time: '18:00' })
  })
  it('G1: varios días ("martes y jueves"), ordenados', async () => {
    as(PA, 'profesor')
    expect((await createSeriesRoute(req('/api/classes/series', 'POST', { ...OK, weekdays: [4, 2] }))).status).toBe(201)
    expect(m.createSeries.mock.calls[0][0].weekdays).toEqual([2, 4])
  })
  it('admin → a nombre del profe del alumno', async () => {
    as('ad', 'admin')
    expect((await createSeriesRoute(req('/api/classes/series', 'POST', OK))).status).toBe(201)
    expect(m.createSeries.mock.calls[0][0]).toMatchObject({ teacherId: PA, createdBy: 'ad' })
  })
  it('profe B → 403', async () => {
    as(PB, 'profesor')
    expect((await createSeriesRoute(req('/api/classes/series', 'POST', OK))).status).toBe(403)
    expect(m.createSeries).not.toHaveBeenCalled()
  })
  it.each([
    ['sin studentId', { studentId: undefined }], ['sin días', { weekdays: [] }], ['día 7', { weekdays: [7] }],
    ['días repetidos', { weekdays: [2, 2] }], ['día suelto (formato viejo)', { weekdays: undefined, weekday: 2 }],
    ['hora 25:00', { time: '25:00' }], ['duración 5', { durationMin: 5 }], ['inicio inválido', { startsOn: '2026-02-30' }],
    ['fin antes del inicio', { endsOn: '2026-09-01' }], ['link de otro sitio', { meetUrl: 'https://evil.com/x' }],
    ['link http', { meetUrl: 'http://zoom.us/j/1' }], ['G1: link de Meet (solo Zoom)', { meetUrl: 'https://meet.google.com/abc-defg-hij' }],
    ['G1: link de Teams (solo Zoom)', { meetUrl: 'https://teams.microsoft.com/l/x' }],
  ])('%s → 400', async (_n, patch) => {
    as(PA, 'profesor')
    const res = await createSeriesRoute(req('/api/classes/series', 'POST', { ...OK, ...patch }))
    expect(res.status).toBe(400)
    expect(m.createSeries).not.toHaveBeenCalled()
  })
  it('G1: el error del link dice que tiene que ser de Zoom', async () => {
    as(PA, 'profesor')
    const res = await createSeriesRoute(req('/api/classes/series', 'POST', { ...OK, meetUrl: 'https://meet.google.com/x' }))
    expect((await res.json()).error).toMatch(/Zoom/)
  })
  it('G1: "Se repite" sobre una clase suelta → crea el horario y borra la suelta en el mismo paso', async () => {
    as(PA, 'profesor')
    const res = await createSeriesRoute(req('/api/classes/series', 'POST', { ...OK, replacesEventId: EVT }))
    expect(res.status).toBe(201)
    expect(m.createSeries).toHaveBeenCalledWith(DATA, EVT)
  })
  it('G1: reemplazar una clase ajena, inexistente o que es excepción de un horario → 404, sin crear', async () => {
    as(PA, 'profesor')
    m.getEvent.mockImplementation(async (id: string) =>
      id === EVT ? { ...EVENT_A, seriesId: SER, originalStartsAt: new Date('2026-10-06T21:00:00Z') } : null)
    for (const id of [EVT, SER, 'x']) {
      expect((await createSeriesRoute(req('/api/classes/series', 'POST', { ...OK, replacesEventId: id }))).status).toBe(404)
    }
    as(PB, 'profesor') // aunque B tuviera un alumno propio, la suelta de A no es suya
    m.getStudentById.mockImplementation(async (id: string) => (id === ST_A ? { id: ST_A, role: 'alumno', teacherId: PB } : null))
    m.getEvent.mockImplementation(async (id: string) => (id === EVT ? EVENT_A : null))
    expect((await createSeriesRoute(req('/api/classes/series', 'POST', { ...OK, replacesEventId: EVT }))).status).toBe(404)
    expect(m.createSeries).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/classes/series/[id] — "Todas las clases" (scope all)', () => {
  it('sin scope = todas: cambia lo pedido (fin, link, duración)', async () => {
    as(PA, 'profesor')
    const res = await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', { endsOn: '2026-12-15', meetUrl: '', durationMin: 90 }), ctx(SER))
    expect(res.status).toBe(200)
    expect(m.updateSeriesAll).toHaveBeenCalledWith(SER, { endsOn: '2026-12-15', meetUrl: null, durationMin: 90 })
  })
  it('G1: ahora SÍ se cambian días y hora (todo el horario)', async () => {
    as(PA, 'profesor')
    const res = await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', { scope: 'all', weekdays: [4, 2], time: '19:30' }), ctx(SER))
    expect(res.status).toBe(200)
    expect(m.updateSeriesAll).toHaveBeenCalledWith(SER, { weekdays: [2, 4], startMinute: 19 * 60 + 30 })
    expect((await res.json()).series).toMatchObject({ weekdays: [2, 4], time: '19:30' })
  })
  it('G1: link de Meet → 400 (solo Zoom)', async () => {
    as(PA, 'profesor')
    expect((await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', { meetUrl: 'https://meet.google.com/x' }), ctx(SER))).status).toBe(400)
    expect(m.updateSeriesAll).not.toHaveBeenCalled()
  })
  it('otro profe, id inexistente o id que no es uuid → el MISMO 404', async () => {
    as(PB, 'profesor')
    const ajena = await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', { durationMin: 90 }), ctx(SER))
    as(PA, 'profesor')
    const noExiste = await patchSeries(req(`/api/classes/series/${EVT}`, 'PATCH', { durationMin: 90 }), ctx(EVT))
    const basura = await deleteSeriesRoute(req('/api/classes/series/xyz', 'DELETE'), ctx('xyz'))
    for (const r of [ajena, noExiste, basura]) {
      expect(r.status).toBe(404)
      expect(await r.json()).toEqual(NOT_FOUND)
    }
    expect(m.updateSeriesAll).not.toHaveBeenCalled()
    expect(m.deleteSeries).not.toHaveBeenCalled()
  })
  it('serie del profe ANTERIOR del alumno (ahora es de B) → 404 para A y para B', async () => {
    m.getStudentById.mockResolvedValue({ id: ST_A, role: 'alumno', teacherId: PB })
    for (const who of [PA, PB]) {
      as(who, 'profesor')
      expect((await deleteSeriesRoute(req(`/api/classes/series/${SER}`, 'DELETE'), ctx(SER))).status).toBe(404)
    }
    expect(m.deleteSeries).not.toHaveBeenCalled()
  })
  it.each([
    ['fin antes del inicio', { endsOn: '2026-01-01' }], ['nada para cambiar', {}], ['scope raro', { scope: 'una', durationMin: 90 }],
    ['días inválidos', { weekdays: [9] }], ['hora inválida', { time: '7pm' }], ['inicio inválido', { startsOn: 'mañana' }],
  ])('%s → 400', async (_n, b) => {
    as(PA, 'profesor')
    expect((await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', b), ctx(SER))).status).toBe(400)
    expect(m.updateSeriesAll).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/classes/series/[id] — "Esta y las siguientes" (scope following)', () => {
  const OCC = '2026-10-13T21:00:00.000Z' // martes 13/10 18:00 BA

  it('corta el horario viejo el día anterior y arranca uno nuevo con lo pedido', async () => {
    as(PA, 'profesor')
    const res = await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', {
      scope: 'following', occurrence: OCC, weekdays: [2, 4], time: '19:00', meetUrl: 'https://zoom.us/j/7',
    }), ctx(SER))
    expect(res.status).toBe(200)
    expect(m.splitSeries).toHaveBeenCalledWith(SER, '2026-10-12', new Date('2026-10-13T03:00:00Z'), {
      weekdays: [2, 4], startMinute: 1140, durationMin: 60, startsOn: '2026-10-13', endsOn: null,
      meetUrl: 'https://zoom.us/j/7', teacherId: PA, studentId: ST_A, createdBy: PA,
    })
    expect(m.updateSeriesAll).not.toHaveBeenCalled()
    expect((await res.json()).series).toMatchObject({ weekdays: [2, 4], time: '19:00', startsOn: '2026-10-13' })
  })
  it('lo que no se cambia se copia del horario viejo (link, duración, fin)', async () => {
    as(PA, 'profesor')
    m.getSeries.mockResolvedValue({ ...SERIES_A, endsOn: '2026-12-31', durationMin: 45 })
    await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', { scope: 'following', occurrence: OCC, time: '17:00' }), ctx(SER))
    expect(m.splitSeries.mock.calls[0][3]).toMatchObject({
      weekdays: [2], startMinute: 1020, durationMin: 45, endsOn: '2026-12-31', meetUrl: SERIES_A.meetUrl,
    })
  })
  it('desde la PRIMERA clase → es "todas" (cambia el horario entero, no corta)', async () => {
    as(PA, 'profesor')
    const res = await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', {
      scope: 'following', occurrence: '2026-09-29T21:00:00.000Z', time: '19:00',
    }), ctx(SER))
    expect(res.status).toBe(200)
    expect(m.splitSeries).not.toHaveBeenCalled()
    expect(m.updateSeriesAll.mock.calls[0][1]).toMatchObject({ startMinute: 1140, startsOn: '2026-09-29' })
  })
  it('una clase que NO es del horario, o sin occurrence → 400', async () => {
    as(PA, 'profesor')
    for (const occurrence of ['2026-10-14T21:00:00.000Z', '2026-10-13T21:30:00.000Z', 'nada', undefined]) {
      expect((await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', { scope: 'following', occurrence, time: '19:00' }), ctx(SER))).status).toBe(400)
    }
    expect(m.splitSeries).not.toHaveBeenCalled()
  })
  it('fin del horario nuevo antes de su inicio → 400', async () => {
    as(PA, 'profesor')
    expect((await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', { scope: 'following', occurrence: OCC, endsOn: '2026-10-01' }), ctx(SER))).status).toBe(400)
    expect(m.splitSeries).not.toHaveBeenCalled()
  })
  it('serie ajena → el MISMO 404 (sin tocar nada)', async () => {
    as(PB, 'profesor')
    const r = await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', { scope: 'following', occurrence: OCC, time: '19:00' }), ctx(SER))
    expect(r.status).toBe(404)
    expect(m.splitSeries).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/classes/series/[id] — cancelar con alcance', () => {
  it('sin scope / "todas" → borra el horario', async () => {
    as(PA, 'profesor')
    expect((await deleteSeriesRoute(req(`/api/classes/series/${SER}`, 'DELETE'), ctx(SER))).status).toBe(200)
    expect((await deleteSeriesRoute(req(`/api/classes/series/${SER}?scope=all`, 'DELETE'), ctx(SER))).status).toBe(200)
    expect(m.deleteSeries).toHaveBeenCalledTimes(2)
    expect(m.splitSeries).not.toHaveBeenCalled()
  })
  it('"esta y las siguientes" → termina el horario el día anterior (no borra)', async () => {
    as(PA, 'profesor')
    const res = await deleteSeriesRoute(req(`/api/classes/series/${SER}?scope=following&occurrence=2026-10-13T21:00:00.000Z`, 'DELETE'), ctx(SER))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, endsOn: '2026-10-12' })
    expect(m.splitSeries).toHaveBeenCalledWith(SER, '2026-10-12', new Date('2026-10-13T03:00:00Z'))
    expect(m.deleteSeries).not.toHaveBeenCalled()
  })
  it('"esta y las siguientes" desde la primera clase → no queda ninguna: se borra', async () => {
    as(PA, 'profesor')
    expect((await deleteSeriesRoute(req(`/api/classes/series/${SER}?scope=following&occurrence=2026-09-29T21:00:00.000Z`, 'DELETE'), ctx(SER))).status).toBe(200)
    expect(m.deleteSeries).toHaveBeenCalledWith(SER)
    expect(m.splitSeries).not.toHaveBeenCalled()
  })
  it('clase que no es del horario o scope raro → 400; ajena → 404', async () => {
    as(PA, 'profesor')
    expect((await deleteSeriesRoute(req(`/api/classes/series/${SER}?scope=following&occurrence=2026-10-14T21:00:00.000Z`, 'DELETE'), ctx(SER))).status).toBe(400)
    expect((await deleteSeriesRoute(req(`/api/classes/series/${SER}?scope=todo`, 'DELETE'), ctx(SER))).status).toBe(400)
    as(PB, 'profesor')
    expect((await deleteSeriesRoute(req(`/api/classes/series/${SER}?scope=following&occurrence=2026-10-13T21:00:00.000Z`, 'DELETE'), ctx(SER))).status).toBe(404)
    expect(m.deleteSeries).not.toHaveBeenCalled()
    expect(m.splitSeries).not.toHaveBeenCalled()
  })
})

describe('POST /api/classes/events — suelta, cancelar, mover', () => {
  it('clase suelta: fecha/hora de Buenos Aires → instante UTC', async () => {
    as(PA, 'profesor')
    const res = await createEventRoute(req('/api/classes/events', 'POST', { studentId: ST_A, date: '2026-10-01', time: '17:00', durationMin: 45 }))
    expect(res.status).toBe(201)
    expect(m.createSingleClass).toHaveBeenCalledWith({
      teacherId: PA, studentId: ST_A, startsAt: new Date('2026-10-01T20:00:00Z'), durationMin: 45, meetUrl: null, createdBy: PA,
    })
  })
  it('G1: clase suelta con link de Meet → 400 (solo Zoom)', async () => {
    as(PA, 'profesor')
    const res = await createEventRoute(req('/api/classes/events', 'POST', { studentId: ST_A, date: '2026-10-01', time: '17:00', durationMin: 45, meetUrl: 'https://meet.google.com/abc' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Zoom/)
    expect(m.createSingleClass).not.toHaveBeenCalled()
  })
  it('clase suelta a un alumno ajeno → 403', async () => {
    as(PB, 'profesor')
    expect((await createEventRoute(req('/api/classes/events', 'POST', { studentId: ST_A, date: '2026-10-01', time: '17:00', durationMin: 45 }))).status).toBe(403)
  })
  it('cancelar un martes real de la serie', async () => {
    as(PA, 'profesor')
    const res = await createEventRoute(req('/api/classes/events', 'POST', { seriesId: SER, originalStartsAt: '2026-10-06T21:00:00.000Z', action: 'cancel' }))
    expect(res.status).toBe(201)
    expect(m.upsertException).toHaveBeenCalledWith({
      teacherId: PA, studentId: ST_A, seriesId: SER, originalStartsAt: new Date('2026-10-06T21:00:00Z'),
      startsAt: new Date('2026-10-06T21:00:00Z'), durationMin: 60, status: 'cancelled', meetUrl: null, createdBy: PA,
    })
  })
  it('mover un martes al jueves 17:00 (90 min, otro link)', async () => {
    as(PA, 'profesor')
    const res = await createEventRoute(req('/api/classes/events', 'POST', {
      seriesId: SER, originalStartsAt: '2026-10-06T21:00:00.000Z', action: 'move', date: '2026-10-08', time: '17:00', durationMin: 90, meetUrl: 'https://zoom.us/j/9',
    }))
    expect(res.status).toBe(201)
    expect(m.upsertException.mock.calls[0][0]).toMatchObject({
      startsAt: new Date('2026-10-08T20:00:00Z'), durationMin: 90, status: 'scheduled', meetUrl: 'https://zoom.us/j/9',
    })
  })
  it('un "original" que NO es clase de la serie → 400', async () => {
    as(PA, 'profesor')
    for (const o of ['2026-10-07T21:00:00.000Z', '2026-10-06T21:05:00.000Z', 'nada', undefined]) {
      expect((await createEventRoute(req('/api/classes/events', 'POST', { seriesId: SER, originalStartsAt: o, action: 'cancel' }))).status).toBe(400)
    }
    expect(m.upsertException).not.toHaveBeenCalled()
  })
  it('serie ajena / inexistente / no-uuid → el MISMO 404; action inválida → 400', async () => {
    as(PB, 'profesor')
    const ajena = await createEventRoute(req('/api/classes/events', 'POST', { seriesId: SER, originalStartsAt: '2026-10-06T21:00:00.000Z', action: 'cancel' }))
    as(PA, 'profesor')
    const noExiste = await createEventRoute(req('/api/classes/events', 'POST', { seriesId: EVT, originalStartsAt: '2026-10-06T21:00:00.000Z', action: 'cancel' }))
    const basura = await createEventRoute(req('/api/classes/events', 'POST', { seriesId: 'x', originalStartsAt: '2026-10-06T21:00:00.000Z', action: 'cancel' }))
    for (const r of [ajena, noExiste, basura]) {
      expect(r.status).toBe(404)
      expect(await r.json()).toEqual(NOT_FOUND)
    }
    expect((await createEventRoute(req('/api/classes/events', 'POST', { seriesId: SER, originalStartsAt: '2026-10-06T21:00:00.000Z', action: 'borrar' }))).status).toBe(400)
    expect(m.upsertException).not.toHaveBeenCalled()
  })
  it('mover sin fecha/hora, duración o link inválidos → 400', async () => {
    as(PA, 'profesor')
    const base = { seriesId: SER, originalStartsAt: '2026-10-06T21:00:00.000Z', action: 'move' }
    for (const b of [{}, { date: '2026-10-08' }, { date: '2026-10-08', time: '17:00', durationMin: 500 }, { date: '2026-10-08', time: '17:00', meetUrl: 'https://x.com' },
      { date: '2026-10-08', time: '17:00', meetUrl: 'https://meet.google.com/abc' }]) { // G1: solo Zoom
      expect((await createEventRoute(req('/api/classes/events', 'POST', { ...base, ...b }))).status).toBe(400)
    }
    expect(m.upsertException).not.toHaveBeenCalled()
  })
})

describe('PATCH / DELETE /api/classes/events/[id]', () => {
  it('reprogramar y cancelar una suelta', async () => {
    as(PA, 'profesor')
    expect((await patchEvent(req(`/api/classes/events/${EVT}`, 'PATCH', { date: '2026-10-02', time: '09:30', status: 'cancelled' }), ctx(EVT))).status).toBe(200)
    expect(m.updateEvent).toHaveBeenCalledWith(EVT, { startsAt: new Date('2026-10-02T12:30:00Z'), status: 'cancelled' })
  })
  it('otro profe / inexistente → el MISMO 404; datos inválidos → 400; borrar ok', async () => {
    as(PB, 'profesor')
    const ajena = await deleteEventRoute(req(`/api/classes/events/${EVT}`, 'DELETE'), ctx(EVT))
    expect(ajena.status).toBe(404)
    expect(await ajena.json()).toEqual(NOT_FOUND)
    expect(m.deleteEvent).not.toHaveBeenCalled()
    as(PA, 'profesor')
    for (const b of [{}, { status: 'borrada' }, { date: '2026-10-02' }, { durationMin: 0 }, { meetUrl: 'ftp://zoom.us' }, { meetUrl: 'https://teams.live.com/meet/1' }]) {
      expect((await patchEvent(req(`/api/classes/events/${EVT}`, 'PATCH', b), ctx(EVT))).status).toBe(400)
    }
    expect((await deleteEventRoute(req(`/api/classes/events/${EVT}`, 'DELETE'), ctx(EVT))).status).toBe(200)
    expect(m.deleteEvent).toHaveBeenCalledWith(EVT)
  })
})
