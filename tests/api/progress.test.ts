// @vitest-environment node
// Avance del alumno (2026-11):
//   · PUT /api/student/material/[videoId]/progress: solo el alumno, sobre SU asignación.
//   · GET /api/videos/[id]/progress: profe (solo sus alumnos) y admin (todos); sin mails.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { authMock, saveMock, listMock } = vi.hoisted(() => ({ authMock: vi.fn(), saveMock: vi.fn(), listMock: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/assignments', () => ({ saveProgress: saveMock, listProgressForVideo: listMock }))

import { PUT } from '@/app/api/student/material/[videoId]/progress/route'
import { GET } from '@/app/api/videos/[id]/progress/route'

const AL = 'aaaaaaaa-0000-4000-8000-00000000000a'
const PROF = 'cccccccc-0000-4000-8000-00000000000c'
const VID = '11111111-2222-4333-8444-555555555555'

const as = (id: string | null, role: string | null) => authMock.mockResolvedValue(id ? { user: { id, role } } : null)
const put = (videoId: string, body: unknown) =>
  PUT(new NextRequest(`http://localhost/api/student/material/${videoId}/progress`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ videoId }) })
const get = (id: string) => GET(new NextRequest(`http://localhost/api/videos/${id}/progress`), { params: Promise.resolve({ id }) })

beforeEach(() => {
  authMock.mockReset(); saveMock.mockReset().mockResolvedValue(true); listMock.mockReset().mockResolvedValue([])
})

describe('PUT progress (alumno)', () => {
  it('guarda el segundo del alumno de la SESIÓN', async () => {
    as(AL, 'alumno')
    const res = await put(VID, { position: 754.27, studentId: 'otro' })
    expect(res.status).toBe(200)
    expect(saveMock).toHaveBeenCalledWith(AL, VID, 754.3)
  })
  it('profe y admin no pueden (403) y sin sesión 401, sin tocar la base', async () => {
    for (const [id, role, st] of [[PROF, 'profesor', 403], [PROF, 'admin', 403], [null, null, 401]] as const) {
      as(id, role)
      expect((await put(VID, { position: 10 })).status).toBe(st)
    }
    expect(saveMock).not.toHaveBeenCalled()
  })
  it('posición inválida: 400', async () => {
    as(AL, 'alumno')
    for (const body of [{}, { position: -1 }, { position: 'x' }, { position: 1e9 }, null]) expect((await put(VID, body)).status).toBe(400)
    expect(saveMock).not.toHaveBeenCalled()
  })
  it('video que no es suyo o id inválido: el mismo 404', async () => {
    as(AL, 'alumno')
    saveMock.mockResolvedValue(false)
    const a = await put(VID, { position: 5 })
    const b = await put('nope', { position: 5 })
    expect(a.status).toBe(404); expect(b.status).toBe(404)
    expect(await a.json()).toEqual(await b.json())
  })
})

describe('GET progress (staff)', () => {
  it('el profe ve solo a sus alumnos, con nombre corto y sin mail', async () => {
    as(PROF, 'profesor')
    listMock.mockResolvedValue([{ studentId: AL, name: 'Juan Pérez', email: 'juan@x.com', positionSec: 754, seenAt: new Date('2026-11-10T15:00:00Z') }])
    const res = await get(VID)
    expect(listMock).toHaveBeenCalledWith(VID, PROF)
    const body = await res.json()
    expect(body.progress).toEqual([{ studentId: AL, name: 'Juan', positionSec: 754, seenAt: '2026-11-10T15:00:00.000Z' }])
    expect(JSON.stringify(body)).not.toContain('juan@x.com')
  })
  it('el admin ve a todos', async () => {
    as(PROF, 'admin')
    await get(VID)
    expect(listMock).toHaveBeenCalledWith(VID, null)
  })
  it('el alumno no entra', async () => {
    as(AL, 'alumno')
    expect((await get(VID)).status).toBe(403)
    expect(listMock).not.toHaveBeenCalled()
  })
})
