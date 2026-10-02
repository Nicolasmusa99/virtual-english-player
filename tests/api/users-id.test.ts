// @vitest-environment node
// PATCH /api/users/[id] — cambiar el nombre y apellido de un ALUMNO. Permisos REALES
// (requireRole); se mockean la sesión y el acceso a datos.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { authMock, getStudentByIdMock, setUserNameMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getStudentByIdMock: vi.fn(),
  setUserNameMock: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/users', () => ({ getStudentById: getStudentByIdMock, setUserName: setUserNameMock }))

import { PATCH } from '@/app/api/users/[id]/route'

const patch = (id: string, body: unknown) =>
  PATCH(new NextRequest(`http://localhost/api/users/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) })

const ADMIN = { user: { id: 'ad-1', role: 'admin' } }
const PROFE = { user: { id: 'pr-1', role: 'profesor' } }
const MINE = { id: 'al-1', role: 'alumno', teacherId: 'pr-1' }
const OTHER = { id: 'al-2', role: 'alumno', teacherId: 'pr-9' }

beforeEach(() => {
  authMock.mockReset()
  getStudentByIdMock.mockReset().mockImplementation(async (id: string) => ({ 'al-1': MINE, 'al-2': OTHER, 'pr-9': { id: 'pr-9', role: 'profesor', teacherId: null } } as Record<string, unknown>)[id] ?? null)
  setUserNameMock.mockReset().mockResolvedValue(undefined)
})

describe('PATCH /api/users/[id]', () => {
  it('401 sin sesión y 403 alumno; no toca nada', async () => {
    authMock.mockResolvedValue(null)
    expect((await patch('al-1', { name: 'Ana Gómez' })).status).toBe(401)
    authMock.mockResolvedValue({ user: { id: 'al-1', role: 'alumno' } })
    expect((await patch('al-1', { name: 'Ana Gómez' })).status).toBe(403)
    expect(setUserNameMock).not.toHaveBeenCalled()
  })

  it('el profe cambia el nombre de SU alumno (limpio) → 200', async () => {
    authMock.mockResolvedValue(PROFE)
    const res = await patch('al-1', { name: '  Martina   Pérez ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'al-1', name: 'Martina Pérez' })
    expect(setUserNameMock).toHaveBeenCalledWith('al-1', 'Martina Pérez')
  })

  it('el profe NO puede con un alumno ajeno, ni con otro rol, ni con un id que no existe → mismo 404', async () => {
    authMock.mockResolvedValue(PROFE)
    for (const id of ['al-2', 'pr-9', 'nope']) {
      const res = await patch(id, { name: 'Ana Gómez' })
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'No encontrado' })
    }
    expect(setUserNameMock).not.toHaveBeenCalled()
  })

  it('el admin puede con cualquier alumno, pero no con un profe', async () => {
    authMock.mockResolvedValue(ADMIN)
    expect((await patch('al-2', { name: 'Tomás Ruiz' })).status).toBe(200)
    expect((await patch('pr-9', { name: 'Laura Sosa' })).status).toBe(404)
    expect(setUserNameMock).toHaveBeenCalledTimes(1)
  })

  it('nombre vacío o inválido → 400; solo se lee `name`', async () => {
    authMock.mockResolvedValue(ADMIN)
    for (const body of [{}, { name: '' }, { name: 'a' }, { name: 'x@y.com' }, null]) {
      expect((await patch('al-1', body)).status).toBe(400)
    }
    await patch('al-1', { name: 'Ana Gómez', role: 'admin', teacherId: 'pr-9', email: 'z@z.com' })
    expect(setUserNameMock).toHaveBeenCalledWith('al-1', 'Ana Gómez')
    expect(setUserNameMock).toHaveBeenCalledTimes(1)
  })
})
