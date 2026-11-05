// @vitest-environment node
// POST /api/login (2026-11): entrar con mail y contraseña. La base se mockea
// (@/lib/users); el hash es real (lib/password).
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { hashPassword } from '@/lib/password'

const { getLoginMock, createSessionMock } = vi.hoisted(() => ({ getLoginMock: vi.fn(), createSessionMock: vi.fn() }))
vi.mock('@/lib/users', () => ({ getLoginByEmail: getLoginMock, createSession: createSessionMock }))

import { POST } from '@/app/api/login/route'

let HASH = ''
beforeAll(async () => { HASH = await hashPassword('clave-buena-1') })
beforeEach(() => {
  getLoginMock.mockReset()
  createSessionMock.mockReset().mockResolvedValue({ sessionToken: 'tok-123', expires: new Date('2026-12-04T00:00:00Z') })
})
const req = (body: unknown, url = 'https://ve.app/api/login', proto: string | null = 'https') =>
  new NextRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(proto ? { 'x-forwarded-proto': proto } : {}) }, body: JSON.stringify(body) })

describe('POST /api/login', () => {
  it('mail y contraseña bien → abre sesión y deja la cookie de Auth.js', async () => {
    getLoginMock.mockResolvedValue({ id: 'u-1', role: 'alumno', passwordHash: HASH })
    const res = await POST(req({ email: ' Martina@X.com ', password: 'clave-buena-1' }))
    expect(res.status).toBe(200)
    expect(getLoginMock).toHaveBeenCalledWith('martina@x.com')
    expect(createSessionMock).toHaveBeenCalledWith('u-1')
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toContain('__Secure-authjs.session-token=tok-123')
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).toMatch(/SameSite=lax/i)
  })

  it('en http (local) la cookie va sin prefijo', async () => {
    getLoginMock.mockResolvedValue({ id: 'u-1', role: 'alumno', passwordHash: HASH })
    const res = await POST(req({ email: 'ana.local@x.com', password: 'clave-buena-1' }, 'http://localhost/api/login', null))
    expect(res.headers.get('set-cookie')).toMatch(/^authjs\.session-token=tok-123/)
  })

  it('contraseña mal, mail inexistente, solo Google o sin rol → el MISMO 401, sin sesión', async () => {
    getLoginMock.mockResolvedValue({ id: 'u-1', role: 'alumno', passwordHash: HASH })
    const a = await POST(req({ email: 'uno.mal@x.com', password: 'clave-mala-1' }))
    getLoginMock.mockResolvedValue(null)
    const b = await POST(req({ email: 'no.existe@x.com', password: 'clave-buena-1' }))
    getLoginMock.mockResolvedValue({ id: 'u-2', role: null, passwordHash: HASH })
    const c = await POST(req({ email: 'sin.rol@x.com', password: 'clave-buena-1' }))
    getLoginMock.mockResolvedValue({ id: 'u-3', role: 'alumno', passwordHash: null })
    const d = await POST(req({ email: 'solo.google@x.com', password: 'clave-buena-1' }))
    const bodies = await Promise.all([a, b, c, d].map((r) => r.json()))
    expect([a, b, c, d].map((r) => r.status)).toEqual([401, 401, 401, 401])
    expect(new Set(bodies.map((x) => x.error)).size).toBe(1)
    expect(createSessionMock).not.toHaveBeenCalled()
    expect(a.headers.get('set-cookie')).toBeNull()
  })

  it('datos vacíos o raros → 401 sin tocar la base', async () => {
    for (const body of [{}, { email: 'no-es-mail', password: 'clave-buena-1' }, { email: 'ana.x@x.com', password: '' }, { email: 'ana.x@x.com', password: 'x'.repeat(300) }]) {
      expect((await POST(req(body))).status).toBe(401)
    }
    expect(getLoginMock).not.toHaveBeenCalled()
  })

  it('5 intentos fallidos seguidos → 429, aunque después venga la buena', async () => {
    getLoginMock.mockResolvedValue({ id: 'u-9', role: 'alumno', passwordHash: HASH })
    for (let i = 0; i < 5; i++) expect((await POST(req({ email: 'freno.test@x.com', password: 'clave-mala-' + i }))).status).toBe(401)
    const res = await POST(req({ email: 'freno.test@x.com', password: 'clave-buena-1' }))
    expect(res.status).toBe(429)
    expect(createSessionMock).not.toHaveBeenCalled()
  })
})
