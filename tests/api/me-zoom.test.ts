// @vitest-environment node
// Calendario (G0) — /api/me/zoom: "Mi sala de Zoom" del usuario de la SESIÓN.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({ auth: vi.fn(), getZoomUrl: vi.fn(), setZoomUrl: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: m.auth }))
vi.mock('@/lib/users', () => ({ getZoomUrl: m.getZoomUrl, setZoomUrl: m.setZoomUrl }))

import { GET, PUT } from '@/app/api/me/zoom/route'

const as = (id: string, role: string | null) => m.auth.mockResolvedValue({ user: { id, role } })
const put = (body: unknown) =>
  new NextRequest('http://localhost/api/me/zoom', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const ROOM = 'https://us02web.zoom.us/j/8412345678?pwd=abc'

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset()
  m.getZoomUrl.mockResolvedValue(ROOM)
  m.setZoomUrl.mockResolvedValue(undefined)
})

describe('/api/me/zoom', () => {
  it('sin sesión 401; alumno o sin rol 403 (sin tocar datos)', async () => {
    m.auth.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
    expect((await PUT(put({ zoomUrl: ROOM }))).status).toBe(401)
    for (const role of ['alumno', null]) {
      as('u', role)
      expect((await GET()).status).toBe(403)
      expect((await PUT(put({ zoomUrl: ROOM }))).status).toBe(403)
    }
    expect(m.getZoomUrl).not.toHaveBeenCalled()
    expect(m.setZoomUrl).not.toHaveBeenCalled()
  })

  it('GET: la sala del usuario de la sesión', async () => {
    as('profe-1', 'profesor')
    expect(await (await GET()).json()).toEqual({ zoomUrl: ROOM })
    expect(m.getZoomUrl).toHaveBeenCalledWith('profe-1')
  })

  it('PUT: guarda SIEMPRE sobre el usuario de la sesión (un id en el body se ignora)', async () => {
    as('profe-1', 'profesor')
    const res = await PUT(put({ zoomUrl: ROOM, userId: 'otro', id: 'otro' }))
    expect(res.status).toBe(200)
    expect(m.setZoomUrl).toHaveBeenCalledWith('profe-1', ROOM)
    expect(await res.json()).toEqual({ zoomUrl: ROOM })
  })

  it('PUT vacío → quita la sala (null); admin también puede', async () => {
    as('ad', 'admin')
    await PUT(put({ zoomUrl: '' }))
    expect(m.setZoomUrl).toHaveBeenCalledWith('ad', null)
  })

  it('PUT: solo links de Zoom por https; body inválido → 400', async () => {
    as('profe-1', 'profesor')
    for (const zoomUrl of ['https://meet.google.com/abc', 'http://zoom.us/j/1', 'https://evil.com/zoom.us', 'hola', 42]) {
      expect((await PUT(put({ zoomUrl }))).status, String(zoomUrl)).toBe(400)
    }
    expect((await PUT(put({}))).status).toBe(400)
    expect((await PUT(new NextRequest('http://localhost/api/me/zoom', { method: 'PUT', body: 'x' }))).status).toBe(400)
    expect(m.setZoomUrl).not.toHaveBeenCalled()
  })
})
