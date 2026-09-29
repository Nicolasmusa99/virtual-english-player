// @vitest-environment node
// Calendario (C1) — GET /api/student/classes: el alumno ve SOLO sus clases con su profe
// ACTUAL. El id del alumno sale SIEMPRE de la sesión; la respuesta es una lista blanca.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ auth: vi.fn(), getStudentById: vi.fn(), getSchedule: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: m.auth }))
vi.mock('@/lib/users', () => ({ getStudentById: m.getStudentById }))
vi.mock('@/lib/classes', () => ({ getSchedule: m.getSchedule }))

import { GET } from '@/app/api/student/classes/route'

const ST = 'st-1'
const OTRO = 'st-2'
const req = (qs = '') => new NextRequest('http://localhost/api/student/classes' + qs)
const as = (id: string, role: string | null) => m.auth.mockResolvedValue({ user: { id, role } })
const ITEM = {
  key: 'ser-1:1790000000000', seriesId: 'ser-1', eventId: null, startsAt: new Date('2026-09-29T21:00:00Z'),
  durationMin: 60, meetUrl: 'https://meet.google.com/abc-defg-hij', status: 'scheduled', originalStartsAt: null,
}

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset()
  m.getStudentById.mockImplementation(async (id: string) => ({ id, role: 'alumno', teacherId: 'profe-1' }))
  m.getSchedule.mockResolvedValue([ITEM])
})

describe('GET /api/student/classes', () => {
  it('sin sesión → 401; profe, admin o sin rol → 403 (sin tocar datos)', async () => {
    m.auth.mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
    for (const role of ['profesor', 'admin', null]) {
      as('u', role)
      expect((await GET(req())).status).toBe(403)
    }
    expect(m.getStudentById).not.toHaveBeenCalled()
    expect(m.getSchedule).not.toHaveBeenCalled()
  })

  it('sus clases con su profe ACTUAL (alumno de la sesión, profe de la base)', async () => {
    as(ST, 'alumno')
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(m.getStudentById).toHaveBeenCalledWith(ST)
    expect(m.getSchedule.mock.calls[0].slice(0, 2)).toEqual([ST, 'profe-1'])
  })

  it('lista blanca: sin ids de serie/evento ni "original"', async () => {
    as(ST, 'alumno')
    const body = await (await GET(req())).json()
    expect(body).toEqual({ classes: [{
      key: ITEM.key, startsAt: '2026-09-29T21:00:00.000Z', durationMin: 60, meetUrl: ITEM.meetUrl, status: 'scheduled',
    }] })
  })

  it('no se puede pedir por OTRO alumno (?studentId= se ignora)', async () => {
    as(ST, 'alumno')
    await GET(req(`?studentId=${OTRO}&teacherId=profe-9`))
    expect(m.getStudentById).toHaveBeenCalledWith(ST)
    expect(m.getSchedule.mock.calls[0].slice(0, 2)).toEqual([ST, 'profe-1'])
  })

  it('sin profe asignado → lista vacía, sin leer clases', async () => {
    as(ST, 'alumno')
    m.getStudentById.mockResolvedValue({ id: ST, role: 'alumno', teacherId: null })
    expect(await (await GET(req())).json()).toEqual({ classes: [] })
    expect(m.getSchedule).not.toHaveBeenCalled()
  })

  it('rango: por defecto desde hace 2 h y 35 días; el mes pedido; >100 días o inválido → 400', async () => {
    as(ST, 'alumno')
    const before = Date.now()
    await GET(req())
    const [, , from, to] = m.getSchedule.mock.calls[0]
    expect(Math.abs(from.getTime() - (before - 2 * 3_600_000))).toBeLessThan(5_000)
    expect(to.getTime() - from.getTime()).toBe(35 * 86_400_000)

    await GET(req('?from=2026-10-01T03:00:00Z&to=2026-11-01T03:00:00Z'))
    expect(m.getSchedule.mock.calls[1].slice(2)).toEqual([new Date('2026-10-01T03:00:00Z'), new Date('2026-11-01T03:00:00Z')])

    expect((await GET(req('?from=2026-01-01T00:00:00Z&to=2026-12-01T00:00:00Z'))).status).toBe(400)
    expect((await GET(req('?from=nada'))).status).toBe(400)
  })
})
