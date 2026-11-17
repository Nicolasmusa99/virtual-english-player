// @vitest-environment node
// Avance del alumno (2026-11):
//   · PUT /api/student/material/[videoId]/progress: solo el alumno, sobre SU asignación.
//   · GET /api/videos/[id]/progress: profe (solo sus alumnos) y admin (todos); sin mails.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { authMock, saveMock, listMock, classListMock, classSaveMock, studentMock } = vi.hoisted(() => ({
  authMock: vi.fn(), saveMock: vi.fn(), listMock: vi.fn(), classListMock: vi.fn(), classSaveMock: vi.fn(), studentMock: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/assignments', () => ({ saveProgress: saveMock, listProgressForVideo: listMock }))
vi.mock('@/lib/classProgress', () => ({ listClassProgressForVideo: classListMock, saveClassProgress: classSaveMock }))
vi.mock('@/lib/users', () => ({ getStudentById: studentMock }))

import { PUT } from '@/app/api/student/material/[videoId]/progress/route'
import { GET } from '@/app/api/videos/[id]/progress/route'
import { PUT as PUT_CLASS } from '@/app/api/videos/[id]/class-progress/route'

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
  classListMock.mockReset().mockResolvedValue([]); classSaveMock.mockReset().mockResolvedValue(undefined); studentMock.mockReset()
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
    listMock.mockResolvedValue([{ studentId: AL, name: 'Juan Pérez', email: 'juan@x.com', positionSec: 310, seenAt: new Date('2026-11-11T15:00:00Z') }])
    classListMock.mockResolvedValue([{ studentId: AL, name: 'Juan Pérez', email: 'juan@x.com', positionSec: 754, seenAt: new Date('2026-11-10T15:00:00Z') }])
    const res = await get(VID)
    expect(listMock).toHaveBeenCalledWith(VID, PROF)
    expect(classListMock).toHaveBeenCalledWith(VID, PROF)
    const body = await res.json()
    expect(body.inClass).toEqual([{ studentId: AL, name: 'Juan', positionSec: 754, seenAt: '2026-11-10T15:00:00.000Z' }])
    expect(body.own).toEqual([{ studentId: AL, name: 'Juan', positionSec: 310, seenAt: '2026-11-11T15:00:00.000Z' }])
    expect(JSON.stringify(body)).not.toContain('juan@x.com')
  })
  it('el admin ve a todos', async () => {
    as(PROF, 'admin')
    await get(VID)
    expect(listMock).toHaveBeenCalledWith(VID, null)
    expect(classListMock).toHaveBeenCalledWith(VID, null)
  })
  it('el alumno no entra', async () => {
    as(AL, 'alumno')
    expect((await get(VID)).status).toBe(403)
    expect(listMock).not.toHaveBeenCalled()
  })
})

describe('PUT class-progress (profe en clase)', () => {
  const OTHER = 'dddddddd-0000-4000-8000-00000000000d'
  const putClass = (id: string, body: unknown) =>
    PUT_CLASS(new NextRequest(`http://localhost/api/videos/${id}/class-progress`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id }) })

  it('el profe guarda dónde quedó con SU alumno, a su nombre', async () => {
    as(PROF, 'profesor')
    studentMock.mockResolvedValue({ id: AL, role: 'alumno', teacherId: PROF })
    const res = await putClass(VID, { studentId: AL, position: 754.27 })
    expect(res.status).toBe(200)
    expect(classSaveMock).toHaveBeenCalledWith(AL, VID, PROF, 754.3)
  })
  it('alumno de otro profe, alguien que no es alumno o que no existe: el mismo 404', async () => {
    as(PROF, 'profesor')
    for (const st of [{ id: AL, role: 'alumno', teacherId: OTHER }, { id: AL, role: 'profesor', teacherId: null }, null]) {
      studentMock.mockResolvedValue(st)
      const res = await putClass(VID, { studentId: AL, position: 5 })
      expect(res.status).toBe(404)
    }
    expect(classSaveMock).not.toHaveBeenCalled()
  })
  it('el admin puede con cualquier alumno', async () => {
    as(PROF, 'admin')
    studentMock.mockResolvedValue({ id: AL, role: 'alumno', teacherId: OTHER })
    expect((await putClass(VID, { studentId: AL, position: 5 })).status).toBe(200)
  })
  it('el alumno no puede (403) y los datos inválidos dan 400', async () => {
    as(AL, 'alumno')
    expect((await putClass(VID, { studentId: AL, position: 5 })).status).toBe(403)
    as(PROF, 'profesor')
    expect((await putClass(VID, { studentId: 'x', position: 5 })).status).toBe(400)
    expect((await putClass(VID, { studentId: AL, position: -3 })).status).toBe(400)
    expect(classSaveMock).not.toHaveBeenCalled()
  })
  it('video inexistente (falla la FK): 404', async () => {
    as(PROF, 'profesor')
    studentMock.mockResolvedValue({ id: AL, role: 'alumno', teacherId: PROF })
    classSaveMock.mockRejectedValue(new Error('fk'))
    expect((await putClass(VID, { studentId: AL, position: 5 })).status).toBe(404)
  })
})
