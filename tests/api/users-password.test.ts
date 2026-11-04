// @vitest-environment node
// Cuentas con usuario y contraseña (2026-11): el alta (POST /api/users con access:
// 'password') y "Cambiar contraseña" del admin (PATCH /api/users/[id] { password }).
// Permisos REALES; se mockean la sesión y el acceso a datos.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { verifyPassword } from '@/lib/password'

const m = vi.hoisted(() => ({
  auth: vi.fn(), getUserByEmail: vi.fn(), getUserByUsername: vi.fn(), getUserById: vi.fn(), insertUser: vi.fn(),
  listAllUsers: vi.fn(), listStudentsOf: vi.fn(), getStudentById: vi.fn(), getPasswordHash: vi.fn(), setPassword: vi.fn(),
  setUserName: vi.fn(), setUserTeacher: vi.fn(), deleteUser: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: m.auth }))
vi.mock('@/lib/users', () => ({ ...m }))

import { POST } from '@/app/api/users/route'
import { PATCH } from '@/app/api/users/[id]/route'

const ADMIN = { user: { id: 'ad-1', role: 'admin' } }
const PROFE = { user: { id: 'pr-1', role: 'profesor' } }
const UID = '11111111-2222-4333-8444-555555555555'
const post = (body: unknown) => POST(new NextRequest('http://localhost/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
const patch = (id: string, body: unknown) => PATCH(new NextRequest(`http://localhost/api/users/${id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id }) })

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.getUserByEmail.mockResolvedValue(null)
  m.getUserByUsername.mockResolvedValue(null)
  m.insertUser.mockImplementation(async (d: Record<string, unknown>) => ({ id: 'new', ...d }))
})

describe('POST /api/users — con usuario y contraseña', () => {
  it('el admin crea un alumno con usuario y contraseña, sin mail; la contraseña se guarda hasheada', async () => {
    m.auth.mockResolvedValue(ADMIN)
    const res = await post({ name: 'Martina Pérez', role: 'alumno', access: 'password', username: ' Martina.P ', password: 'clave-segura-1' })
    expect(res.status).toBe(201)
    const data = m.insertUser.mock.calls[0][0]
    expect(data).toMatchObject({ name: 'Martina Pérez', email: null, role: 'alumno', username: 'martina.p' })
    expect(data.passwordHash).not.toContain('clave-segura-1')
    expect(await verifyPassword('clave-segura-1', data.passwordHash)).toBe(true)
    expect(JSON.stringify(await res.json())).not.toContain('scrypt')
  })

  it('también con mail (opcional) si se lo pasan', async () => {
    m.auth.mockResolvedValue(ADMIN)
    await post({ name: 'Pablo Díaz', role: 'profesor', access: 'password', username: 'pablo', password: 'clave-segura-1', email: 'Pablo@X.com' })
    expect(m.insertUser.mock.calls[0][0]).toMatchObject({ email: 'pablo@x.com', role: 'profesor', username: 'pablo' })
  })

  it('el profe NO crea cuentas con contraseña', async () => {
    m.auth.mockResolvedValue(PROFE)
    const res = await post({ name: 'Ana Gómez', role: 'alumno', access: 'password', username: 'ana', password: 'clave-segura-1' })
    expect(res.status).toBe(403)
    expect(m.insertUser).not.toHaveBeenCalled()
  })

  it('usuario o contraseña inválidos → 400; usuario repetido → 409', async () => {
    m.auth.mockResolvedValue(ADMIN)
    expect((await post({ name: 'Ana Gómez', role: 'alumno', access: 'password', username: 'a b', password: 'clave-segura-1' })).status).toBe(400)
    expect((await post({ name: 'Ana Gómez', role: 'alumno', access: 'password', username: 'ana', password: 'corta' })).status).toBe(400)
    expect((await post({ name: 'Ana Gómez', role: 'alumno', access: 'raro' })).status).toBe(400)
    m.getUserByUsername.mockResolvedValue({ id: 'x' })
    const dup = await post({ name: 'Ana Gómez', role: 'alumno', access: 'password', username: 'ana', password: 'clave-segura-1' })
    expect(dup.status).toBe(409)
    expect(m.insertUser).not.toHaveBeenCalled()
  })

  it('con Google, como siempre: el mail es obligatorio y no se guarda usuario ni contraseña', async () => {
    m.auth.mockResolvedValue(ADMIN)
    expect((await post({ name: 'Ana Gómez', role: 'alumno' })).status).toBe(400)
    await post({ name: 'Ana Gómez', role: 'alumno', email: 'ana@x.com', username: 'colado', password: 'clave-segura-1' })
    expect(m.insertUser.mock.calls[0][0]).toEqual({ name: 'Ana Gómez', email: 'ana@x.com', role: 'alumno', teacherId: null })
  })
})

describe('PATCH /api/users/[id] { password } — el admin le pone otra contraseña', () => {
  it('admin: hashea, guarda y cierra todas sus sesiones', async () => {
    m.auth.mockResolvedValue(ADMIN)
    m.getStudentById.mockResolvedValue({ id: UID, role: 'alumno', teacherId: null })
    m.getPasswordHash.mockResolvedValue('scrypt$...')
    const res = await patch(UID, { password: 'otra-clave-22' })
    expect(res.status).toBe(200)
    const [id, hash, keep] = m.setPassword.mock.calls[0]
    expect(id).toBe(UID)
    expect(await verifyPassword('otra-clave-22', hash)).toBe(true)
    expect(keep).toBeNull()
  })
  it('el profe no puede (404); una cuenta de Google tampoco tiene (400); corta → 400', async () => {
    m.auth.mockResolvedValue(PROFE)
    m.getStudentById.mockResolvedValue({ id: UID, role: 'alumno', teacherId: 'pr-1' })
    expect((await patch(UID, { password: 'otra-clave-22' })).status).toBe(404)
    m.auth.mockResolvedValue(ADMIN)
    m.getPasswordHash.mockResolvedValue(null)
    expect((await patch(UID, { password: 'otra-clave-22' })).status).toBe(400)
    m.getPasswordHash.mockResolvedValue('scrypt$...')
    expect((await patch(UID, { password: 'corta' })).status).toBe(400)
    expect(m.setPassword).not.toHaveBeenCalled()
  })
})
