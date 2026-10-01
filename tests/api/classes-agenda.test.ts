// @vitest-environment node
// Calendario (G2) — GET /api/classes/agenda ("Mi agenda" del profe). Corren REALES
// requireRole y parseRange; se mockean la sesión y la capa de datos.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ auth: vi.fn(), listStudentNames: vi.fn(), getZoomUrl: vi.fn(), getTeacherSchedule: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: m.auth }))
vi.mock('@/lib/users', () => ({ listStudentNames: m.listStudentNames, getZoomUrl: m.getZoomUrl }))
vi.mock('@/lib/classes', () => ({ getTeacherSchedule: m.getTeacherSchedule }))

import { GET } from '@/app/api/classes/agenda/route'

const PA = 'aaaaaaaa-0000-4000-8000-00000000000a'
const ST1 = 'cccccccc-0000-4000-8000-00000000000c'
const ST2 = 'cccccccc-0000-4000-8000-00000000000d'
const SER = 'dddddddd-0000-4000-8000-00000000000d'
const ROOM = 'https://us02web.zoom.us/j/111'
const as = (id: string, role: string | null) => m.auth.mockResolvedValue({ user: { id, role } })
const get = (qs = '') => GET(new NextRequest('http://localhost/api/classes/agenda' + qs))
const WEEK = '?from=2026-09-28T03:00:00.000Z&to=2026-10-05T03:00:00.000Z'

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset()
  m.listStudentNames.mockResolvedValue([
    { id: ST1, name: 'Martina Pérez', email: 'martina@x.com' },
    { id: ST2, name: null, email: 'tomas@x.com' },
  ])
  m.getZoomUrl.mockResolvedValue(ROOM)
  m.getTeacherSchedule.mockResolvedValue({
    series: [{ id: SER, teacherId: PA, studentId: ST1, weekdays: [2], startMinute: 1080, durationMin: 60, startsOn: '2026-09-01', endsOn: null, meetUrl: null }],
    classes: [{
      key: `${SER}:1`, seriesId: SER, eventId: null, startsAt: new Date('2026-09-29T21:00:00Z'), durationMin: 60,
      meetUrl: null, status: 'scheduled', originalStartsAt: null, studentId: ST1,
    }],
  })
})

describe('GET /api/classes/agenda — quién', () => {
  it('sin sesión → 401', async () => {
    m.auth.mockResolvedValue(null)
    expect((await get(WEEK)).status).toBe(401)
    expect(m.getTeacherSchedule).not.toHaveBeenCalled()
  })
  it.each([['admin'], ['alumno'], [null]])('rol %s → 403 (la agenda es del profe)', async (role) => {
    as(PA, role)
    expect((await get(WEEK)).status).toBe(403)
    expect(m.listStudentNames).not.toHaveBeenCalled()
  })
  it('profe: el alcance sale de la SESIÓN (sus alumnos), no de la URL', async () => {
    as(PA, 'profesor')
    const res = await get(WEEK + `&teacherId=otro&studentId=${ST2}`)
    expect(res.status).toBe(200)
    expect(m.listStudentNames).toHaveBeenCalledWith(PA)
    expect(m.getZoomUrl).toHaveBeenCalledWith(PA)
    const [teacher, ids, from, to] = m.getTeacherSchedule.mock.calls[0]
    expect(teacher).toBe(PA)
    expect(ids).toEqual([ST1, ST2])
    expect(from.toISOString()).toBe('2026-09-28T03:00:00.000Z')
    expect(to.toISOString()).toBe('2026-10-05T03:00:00.000Z')
  })
})

describe('GET /api/classes/agenda — qué devuelve', () => {
  it('alumnos (id, nombre, mail), horarios y clases con su alumno, y "Mi sala de Zoom"', async () => {
    as(PA, 'profesor')
    const body = await (await get(WEEK)).json()
    expect(body.students).toEqual([
      { id: ST1, name: 'Martina Pérez', email: 'martina@x.com' },
      { id: ST2, name: null, email: 'tomas@x.com' },
    ])
    expect(body.series).toEqual([{ id: SER, weekdays: [2], time: '18:00', durationMin: 60, startsOn: '2026-09-01', endsOn: null, meetUrl: null, studentId: ST1 }])
    expect(body.classes).toEqual([{
      key: `${SER}:1`, seriesId: SER, eventId: null, startsAt: '2026-09-29T21:00:00.000Z', durationMin: 60,
      meetUrl: null, status: 'scheduled', originalStartsAt: null, studentId: ST1,
    }])
    expect(body.zoomUrl).toBe(ROOM)
    expect(JSON.stringify(body)).not.toContain('teacherId')
  })
  it('sin alumnos → listas vacías', async () => {
    as(PA, 'profesor')
    m.listStudentNames.mockResolvedValue([])
    m.getTeacherSchedule.mockResolvedValue({ series: [], classes: [] })
    const body = await (await get(WEEK)).json()
    expect(body).toMatchObject({ students: [], series: [], classes: [] })
    expect(m.getTeacherSchedule.mock.calls[0][1]).toEqual([])
  })
  it('rango inválido o de más de 100 días → 400', async () => {
    as(PA, 'profesor')
    expect((await get('?from=nada&to=2026-10-05T03:00:00Z')).status).toBe(400)
    expect((await get('?from=2026-10-05T03:00:00Z&to=2026-09-28T03:00:00Z')).status).toBe(400)
    expect((await get('?from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z')).status).toBe(400)
    expect(m.getTeacherSchedule).not.toHaveBeenCalled()
  })
  it('sin rango → 7 días desde ahora', async () => {
    as(PA, 'profesor')
    await get()
    const [, , from, to] = m.getTeacherSchedule.mock.calls[0]
    expect(to.getTime() - from.getTime()).toBe(7 * 86_400_000)
  })
})
