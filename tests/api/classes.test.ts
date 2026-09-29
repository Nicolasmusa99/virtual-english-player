// @vitest-environment node
// Calendario (C1) — rutas del PROFE: /api/classes, /api/classes/series[/id], /api/classes/events[/id].
// Corren REALES requireRole, lib/classAccess (quién puede qué) y lib/classSchedule
// (validación y fechas). Se mockean solo la sesión, getStudentById y la capa de datos.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  auth: vi.fn(), getStudentById: vi.fn(), getZoomUrl: vi.fn(),
  getSchedule: vi.fn(), listActiveSeries: vi.fn(), createSeries: vi.fn(), getSeries: vi.fn(),
  updateSeries: vi.fn(), deleteSeries: vi.fn(), createSingleClass: vi.fn(), upsertException: vi.fn(),
  getEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: m.auth }))
vi.mock('@/lib/users', () => ({ getStudentById: m.getStudentById, getZoomUrl: m.getZoomUrl }))
vi.mock('@/lib/classes', () => ({
  getSchedule: m.getSchedule, listActiveSeries: m.listActiveSeries, createSeries: m.createSeries, getSeries: m.getSeries,
  updateSeries: m.updateSeries, deleteSeries: m.deleteSeries, createSingleClass: m.createSingleClass,
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
  id: SER, teacherId: PA, studentId: ST_A, weekday: 2, startMinute: 1080, durationMin: 60,
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
  m.updateSeries.mockImplementation(async (id, p) => ({ ...SERIES_A, ...p }))
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
    expect(body.series).toEqual([{ id: SER, weekday: 2, time: '18:00', durationMin: 60, startsOn: '2026-09-29', endsOn: null, meetUrl: SERIES_A.meetUrl }])
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

describe('POST /api/classes/series — horario fijo', () => {
  const OK = { studentId: ST_A, weekday: 2, time: '18:00', durationMin: 60, startsOn: '2026-09-29', meetUrl: 'https://zoom.us/j/1' }

  it('crea a nombre del profe (teacher_id del SERVIDOR, no del body)', async () => {
    as(PA, 'profesor')
    const res = await createSeriesRoute(req('/api/classes/series', 'POST', { ...OK, teacherId: PB, createdBy: PB, id: 'x' }))
    expect(res.status).toBe(201)
    expect(m.createSeries).toHaveBeenCalledWith({
      teacherId: PA, studentId: ST_A, weekday: 2, startMinute: 1080, durationMin: 60,
      startsOn: '2026-09-29', endsOn: null, meetUrl: 'https://zoom.us/j/1', createdBy: PA,
    })
    expect((await res.json()).series).toMatchObject({ weekday: 2, time: '18:00' })
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
    ['sin studentId', { studentId: undefined }], ['día 7', { weekday: 7 }], ['hora 25:00', { time: '25:00' }],
    ['duración 5', { durationMin: 5 }], ['inicio inválido', { startsOn: '2026-02-30' }],
    ['fin antes del inicio', { endsOn: '2026-09-01' }], ['link de otro sitio', { meetUrl: 'https://evil.com/x' }],
    ['link http', { meetUrl: 'http://zoom.us/j/1' }],
  ])('%s → 400', async (_n, patch) => {
    as(PA, 'profesor')
    expect((await createSeriesRoute(req('/api/classes/series', 'POST', { ...OK, ...patch }))).status).toBe(400)
    expect(m.createSeries).not.toHaveBeenCalled()
  })
})

describe('PATCH / DELETE /api/classes/series/[id]', () => {
  it('el profe cambia fin, link y duración', async () => {
    as(PA, 'profesor')
    const res = await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', { endsOn: '2026-12-15', meetUrl: '', durationMin: 90 }), ctx(SER))
    expect(res.status).toBe(200)
    expect(m.updateSeries).toHaveBeenCalledWith(SER, { endsOn: '2026-12-15', meetUrl: null, durationMin: 90 })
  })
  it('cambiar día u hora → 400 (se hace terminando y creando otro)', async () => {
    as(PA, 'profesor')
    for (const b of [{ weekday: 3 }, { time: '19:00' }, { startsOn: '2026-10-01' }]) {
      expect((await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', b), ctx(SER))).status).toBe(400)
    }
    expect(m.updateSeries).not.toHaveBeenCalled()
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
    expect(m.updateSeries).not.toHaveBeenCalled()
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
  it('fin inválido / nada para cambiar → 400; DELETE ok', async () => {
    as(PA, 'profesor')
    expect((await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', { endsOn: '2026-01-01' }), ctx(SER))).status).toBe(400)
    expect((await patchSeries(req(`/api/classes/series/${SER}`, 'PATCH', {}), ctx(SER))).status).toBe(400)
    expect((await deleteSeriesRoute(req(`/api/classes/series/${SER}`, 'DELETE'), ctx(SER))).status).toBe(200)
    expect(m.deleteSeries).toHaveBeenCalledWith(SER)
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
    for (const b of [{}, { date: '2026-10-08' }, { date: '2026-10-08', time: '17:00', durationMin: 500 }, { date: '2026-10-08', time: '17:00', meetUrl: 'https://x.com' }]) {
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
    for (const b of [{}, { status: 'borrada' }, { date: '2026-10-02' }, { durationMin: 0 }, { meetUrl: 'ftp://zoom.us' }]) {
      expect((await patchEvent(req(`/api/classes/events/${EVT}`, 'PATCH', b), ctx(EVT))).status).toBe(400)
    }
    expect((await deleteEventRoute(req(`/api/classes/events/${EVT}`, 'DELETE'), ctx(EVT))).status).toBe(200)
    expect(m.deleteEvent).toHaveBeenCalledWith(EVT)
  })
})
