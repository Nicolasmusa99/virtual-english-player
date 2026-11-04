// @vitest-environment node
// 2026-11 — DELETE /api/users/[id] (el admin borra cuentas de profes y alumnos) y
// PATCH /api/users/[id] { teacherId } (el admin cambia el profe de un alumno). Permisos
// REALES (requireRole); se mockean la sesión y el acceso a datos.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  auth: vi.fn(), getStudentById: vi.fn(), getUserById: vi.fn(), setUserName: vi.fn(), setUserTeacher: vi.fn(), deleteUser: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: m.auth }))
vi.mock('@/lib/users', () => ({
  getStudentById: m.getStudentById, getUserById: m.getUserById, setUserName: m.setUserName,
  setUserTeacher: m.setUserTeacher, deleteUser: m.deleteUser,
}))

import { DELETE, PATCH } from '@/app/api/users/[id]/route'

const AD = '00000000-0000-4000-8000-0000000000ad'
const AD2 = '00000000-0000-4000-8000-0000000000a2'
const PR = '00000000-0000-4000-8000-0000000000b1'
const PR2 = '00000000-0000-4000-8000-0000000000b2'
const AL = '00000000-0000-4000-8000-0000000000c1'
const PEOPLE: Record<string, { id: string; role: string; teacherId: string | null }> = {
  [AD]: { id: AD, role: 'admin', teacherId: null },
  [AD2]: { id: AD2, role: 'admin', teacherId: null },
  [PR]: { id: PR, role: 'profesor', teacherId: null },
  [PR2]: { id: PR2, role: 'profesor', teacherId: null },
  [AL]: { id: AL, role: 'alumno', teacherId: PR },
}
const as = (id: string, role: string) => m.auth.mockResolvedValue({ user: { id, role } })
const del = (id: string) => DELETE(new NextRequest(`http://localhost/api/users/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) })
const patch = (id: string, body: unknown) => PATCH(new NextRequest(`http://localhost/api/users/${id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id }) })

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset()
  m.getStudentById.mockImplementation(async (id: string) => PEOPLE[id] ?? null)
  m.getUserById.mockImplementation(async (id: string) => (PEOPLE[id] ? { id, role: PEOPLE[id].role } : null))
  m.deleteUser.mockResolvedValue(true)
})

describe('DELETE /api/users/[id]', () => {
  it('el admin borra un alumno y un profe', async () => {
    as(AD, 'admin')
    expect((await del(AL)).status).toBe(200)
    expect((await del(PR)).status).toBe(200)
    expect(m.deleteUser.mock.calls).toEqual([[AL], [PR]])
  })
  it('sin sesión 401; profe o alumno 403; no borra nada', async () => {
    m.auth.mockResolvedValue(null)
    expect((await del(AL)).status).toBe(401)
    as(PR, 'profesor')
    expect((await del(AL)).status).toBe(403)
    as(AL, 'alumno')
    expect((await del(AL)).status).toBe(403)
    expect(m.deleteUser).not.toHaveBeenCalled()
  })
  it('ni la propia cuenta ni la de otro admin', async () => {
    as(AD, 'admin')
    expect((await del(AD)).status).toBe(400)
    expect((await del(AD2)).status).toBe(403)
    expect(m.deleteUser).not.toHaveBeenCalled()
  })
  it('inexistente o id raro → 404', async () => {
    as(AD, 'admin')
    expect((await del('00000000-0000-4000-8000-000000000999')).status).toBe(404)
    expect((await del('nada')).status).toBe(404)
    expect(m.deleteUser).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/users/[id] { teacherId }', () => {
  it('el admin le cambia el profe a un alumno (o lo deja sin profe)', async () => {
    as(AD, 'admin')
    expect((await patch(AL, { teacherId: PR2 })).status).toBe(200)
    expect((await patch(AL, { teacherId: null })).status).toBe(200)
    expect(m.setUserTeacher.mock.calls).toEqual([[AL, PR2], [AL, null]])
  })
  it('tiene que ser un profe existente → si no, 400', async () => {
    as(AD, 'admin')
    for (const teacherId of [AD2, AL, '00000000-0000-4000-8000-000000000999', 'nada']) {
      expect((await patch(AL, { teacherId })).status).toBe(400)
    }
    expect(m.setUserTeacher).not.toHaveBeenCalled()
  })
  it('solo a alumnos, y solo el admin (un profe recibe el mismo 404)', async () => {
    as(AD, 'admin')
    expect((await patch(PR, { teacherId: PR2 })).status).toBe(404)
    as(PR, 'profesor')
    expect((await patch(AL, { teacherId: PR2 })).status).toBe(404)
    expect(m.setUserTeacher).not.toHaveBeenCalled()
  })
  it('si viene el nombre, solo cambia el nombre (el profe se ignora)', async () => {
    as(AD, 'admin')
    expect((await patch(AL, { name: 'Ana Gómez', teacherId: PR2 })).status).toBe(200)
    expect(m.setUserName).toHaveBeenCalledWith(AL, 'Ana Gómez')
    expect(m.setUserTeacher).not.toHaveBeenCalled()
  })
})
