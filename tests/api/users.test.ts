// @vitest-environment node
// Fase 2 — creación/listado de usuarios. La lógica de permisos (requireRole, canCreateRole,
// isRole) corre REAL; se mockean solo la sesión (@/lib/auth) y el acceso a datos (@/lib/users).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  authMock, getUserByEmailMock, getUserByIdMock, insertUserMock, listAllUsersMock, listStudentsOfMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getUserByEmailMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  insertUserMock: vi.fn(),
  listAllUsersMock: vi.fn(),
  listStudentsOfMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/users', () => ({
  getUserByEmail: getUserByEmailMock,
  getUserById: getUserByIdMock,
  insertUser: insertUserMock,
  listAllUsers: listAllUsersMock,
  listStudentsOf: listStudentsOfMock,
}))

import { GET, POST } from '@/app/api/users/route'

const postReq = (body: unknown) =>
  new NextRequest('http://localhost/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  authMock.mockReset()
  getUserByEmailMock.mockReset().mockResolvedValue(null) // por defecto: email libre
  getUserByIdMock.mockReset()
  insertUserMock.mockReset().mockImplementation(async (d: object) => ({ id: 'new-id', ...d }))
  listAllUsersMock.mockReset().mockResolvedValue([])
  listStudentsOfMock.mockReset().mockResolvedValue([])
})

describe('POST /api/users — creación', () => {
  it('401 sin sesión', async () => {
    authMock.mockResolvedValue(null)
    const res = await POST(postReq({ email: 'a@b.com', role: 'alumno' }))
    expect(res.status).toBe(401)
    expect(insertUserMock).not.toHaveBeenCalled()
  })

  it('403 alumno no puede crear', async () => {
    authMock.mockResolvedValue({ user: { id: 'al-1', role: 'alumno' } })
    const res = await POST(postReq({ email: 'a@b.com', role: 'alumno' }))
    expect(res.status).toBe(403)
    expect(insertUserMock).not.toHaveBeenCalled()
  })

  it('admin crea profesor → 201', async () => {
    authMock.mockResolvedValue({ user: { id: 'ad-1', role: 'admin' } })
    const res = await POST(postReq({ email: 'prof@x.com', role: 'profesor' }))
    expect(res.status).toBe(201)
    expect(insertUserMock).toHaveBeenCalledWith({ email: 'prof@x.com', role: 'profesor', teacherId: null })
  })

  it('admin crea alumno con teacherId de un profesor válido → 201', async () => {
    authMock.mockResolvedValue({ user: { id: 'ad-1', role: 'admin' } })
    getUserByIdMock.mockResolvedValue({ id: 'prof-9', role: 'profesor' })
    const res = await POST(postReq({ email: 'al@x.com', role: 'alumno', teacherId: 'prof-9' }))
    expect(res.status).toBe(201)
    expect(insertUserMock).toHaveBeenCalledWith({ email: 'al@x.com', role: 'alumno', teacherId: 'prof-9' })
  })

  it('admin crea alumno con teacherId que NO es profesor → 400', async () => {
    authMock.mockResolvedValue({ user: { id: 'ad-1', role: 'admin' } })
    getUserByIdMock.mockResolvedValue({ id: 'x', role: 'alumno' })
    const res = await POST(postReq({ email: 'al@x.com', role: 'alumno', teacherId: 'x' }))
    expect(res.status).toBe(400)
    expect(insertUserMock).not.toHaveBeenCalled()
  })

  it('admin crea alumno con teacherId inexistente → 400', async () => {
    authMock.mockResolvedValue({ user: { id: 'ad-1', role: 'admin' } })
    getUserByIdMock.mockResolvedValue(null)
    const res = await POST(postReq({ email: 'al@x.com', role: 'alumno', teacherId: 'ghost' }))
    expect(res.status).toBe(400)
  })

  it('admin crea alumno sin teacherId → 201, teacherId null (sin profe)', async () => {
    authMock.mockResolvedValue({ user: { id: 'ad-1', role: 'admin' } })
    const res = await POST(postReq({ email: 'al@x.com', role: 'alumno' }))
    expect(res.status).toBe(201)
    expect(insertUserMock).toHaveBeenCalledWith({ email: 'al@x.com', role: 'alumno', teacherId: null })
  })

  it('profesor crea alumno → teacherId FORZADO a su propio id (ignora el body)', async () => {
    authMock.mockResolvedValue({ user: { id: 'prof-1', role: 'profesor' } })
    const res = await POST(postReq({ email: 'al@x.com', role: 'alumno', teacherId: 'otro-profe' }))
    expect(res.status).toBe(201)
    expect(insertUserMock).toHaveBeenCalledWith({ email: 'al@x.com', role: 'alumno', teacherId: 'prof-1' })
    expect(getUserByIdMock).not.toHaveBeenCalled() // no valida: se fuerza self
  })

  it('escalada bloqueada: profesor NO puede crear profesor → 403', async () => {
    authMock.mockResolvedValue({ user: { id: 'prof-1', role: 'profesor' } })
    const res = await POST(postReq({ email: 'p@x.com', role: 'profesor' }))
    expect(res.status).toBe(403)
    expect(insertUserMock).not.toHaveBeenCalled()
  })

  it('escalada bloqueada: profesor NO puede crear admin → 403', async () => {
    authMock.mockResolvedValue({ user: { id: 'prof-1', role: 'profesor' } })
    const res = await POST(postReq({ email: 'a@x.com', role: 'admin' }))
    expect(res.status).toBe(403)
  })

  it('email inválido → 400', async () => {
    authMock.mockResolvedValue({ user: { id: 'ad-1', role: 'admin' } })
    const res = await POST(postReq({ email: 'no-es-email', role: 'alumno' }))
    expect(res.status).toBe(400)
  })

  it('role inválido → 400', async () => {
    authMock.mockResolvedValue({ user: { id: 'ad-1', role: 'admin' } })
    const res = await POST(postReq({ email: 'a@x.com', role: 'superadmin' }))
    expect(res.status).toBe(400)
  })

  it('email duplicado → 409, nunca inserta', async () => {
    authMock.mockResolvedValue({ user: { id: 'ad-1', role: 'admin' } })
    getUserByEmailMock.mockResolvedValue({ id: 'existente' })
    const res = await POST(postReq({ email: 'dup@x.com', role: 'profesor' }))
    expect(res.status).toBe(409)
    expect(insertUserMock).not.toHaveBeenCalled()
  })

  it('teacherId en no-alumno (admin crea profesor con teacherId) → 400', async () => {
    authMock.mockResolvedValue({ user: { id: 'ad-1', role: 'admin' } })
    const res = await POST(postReq({ email: 'p@x.com', role: 'profesor', teacherId: 'prof-9' }))
    expect(res.status).toBe(400)
  })

  it('email normalizado (trim + lowercase) antes de insertar', async () => {
    authMock.mockResolvedValue({ user: { id: 'ad-1', role: 'admin' } })
    await POST(postReq({ email: '  Foo@BAR.com ', role: 'profesor' }))
    expect(insertUserMock).toHaveBeenCalledWith({ email: 'foo@bar.com', role: 'profesor', teacherId: null })
  })

  it('mass-assignment cerrado: campos extra se ignoran', async () => {
    authMock.mockResolvedValue({ user: { id: 'ad-1', role: 'admin' } })
    await POST(postReq({ email: 'a@x.com', role: 'alumno', id: 'evil', name: 'x', createdAt: 'y' }))
    expect(insertUserMock).toHaveBeenCalledWith({ email: 'a@x.com', role: 'alumno', teacherId: null })
    const arg = insertUserMock.mock.calls[0][0]
    expect(arg).not.toHaveProperty('id')
    expect(arg).not.toHaveProperty('name')
  })
})

describe('GET /api/users — listado con control de acceso', () => {
  it('401 sin sesión', async () => {
    authMock.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('403 alumno', async () => {
    authMock.mockResolvedValue({ user: { id: 'al-1', role: 'alumno' } })
    const res = await GET()
    expect(res.status).toBe(403)
    expect(listAllUsersMock).not.toHaveBeenCalled()
    expect(listStudentsOfMock).not.toHaveBeenCalled()
  })

  it('admin ve TODOS', async () => {
    authMock.mockResolvedValue({ user: { id: 'ad-1', role: 'admin' } })
    listAllUsersMock.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(listAllUsersMock).toHaveBeenCalled()
    expect(listStudentsOfMock).not.toHaveBeenCalled()
    expect((await res.json()).users).toHaveLength(2)
  })

  it('profesor ve SOLO sus alumnos (filtro por su id, sin parámetro del cliente)', async () => {
    authMock.mockResolvedValue({ user: { id: 'prof-1', role: 'profesor' } })
    listStudentsOfMock.mockResolvedValue([{ id: 'al-1', teacherId: 'prof-1' }])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(listStudentsOfMock).toHaveBeenCalledWith('prof-1') // filtro server-side por la sesión
    expect(listAllUsersMock).not.toHaveBeenCalled()
  })
})
