// @vitest-environment node
// POST /api/signup (2026-11): crear cuenta desde la bienvenida. Entra como ALUMNO sin profe.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { verifyPassword } from '@/lib/password'

const m = vi.hoisted(() => ({ getUserByEmail: vi.fn(), insertUser: vi.fn(), createSession: vi.fn() }))
vi.mock('@/lib/users', () => ({ ...m }))

import { POST } from '@/app/api/signup/route'

let ipN = 0
const req = (body: unknown, ip = `10.0.0.${++ipN}`) => new NextRequest('https://ve.app/api/signup', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip, 'x-forwarded-proto': 'https' }, body: JSON.stringify(body),
})
const OK = { name: 'Sofía Gómez', email: ' Sofi@Gmail.com ', password: 'clave-segura-1' }
beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.getUserByEmail.mockResolvedValue(null)
  m.insertUser.mockImplementation(async (d: object) => ({ id: 'new-1', ...d }))
  m.createSession.mockResolvedValue({ sessionToken: 'tok-new', expires: new Date('2026-12-04T00:00:00Z') })
})

describe('POST /api/signup', () => {
  it('crea un ALUMNO sin profe (aunque pidan otro rol), hashea la contraseña y entra', async () => {
    const res = await POST(req({ ...OK, role: 'admin', teacherId: 'pr-1' }))
    expect(res.status).toBe(201)
    const d = m.insertUser.mock.calls[0][0]
    expect(d).toMatchObject({ name: 'Sofía Gómez', email: 'sofi@gmail.com', role: 'alumno', teacherId: null })
    expect(d).not.toHaveProperty('username')
    expect(await verifyPassword('clave-segura-1', d.passwordHash)).toBe(true)
    expect(m.createSession).toHaveBeenCalledWith('new-1')
    expect(res.headers.get('set-cookie')).toContain('__Secure-authjs.session-token=tok-new')
  })
  it('los tres campos son obligatorios (400); mail tomado → 409; sin crear nada', async () => {
    for (const bad of [{ ...OK, name: 'x' }, { ...OK, email: undefined }, { ...OK, email: 'no-mail' }, { ...OK, password: 'corta' }]) {
      expect((await POST(req(bad))).status).toBe(400)
    }
    m.getUserByEmail.mockResolvedValue({ id: 'y' })
    expect((await POST(req(OK))).status).toBe(409)
    expect(m.insertUser).not.toHaveBeenCalled()
  })
  it('hasta 5 cuentas por conexión; la sexta espera (429)', async () => {
    for (let i = 0; i < 5; i++) expect((await POST(req({ ...OK, email: `alu${i}@x.com` }, '9.9.9.9'))).status).toBe(201)
    expect((await POST(req({ ...OK, email: 'alu6@x.com' }, '9.9.9.9'))).status).toBe(429)
    expect((await POST(req({ ...OK, email: 'alu7@x.com' }, '8.8.8.8'))).status).toBe(201)
  })
})
