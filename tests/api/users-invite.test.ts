// @vitest-environment node
// F2 — POST /api/users/[id]/invite (botón "enviar invitación", también reenvía).
// requireRole corre REAL; se mockean la sesión, el acceso a usuarios, la emisión
// de tokens y el transporte de mail. Cero red.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { authMock, getUserMock, createTokenMock, sendMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getUserMock: vi.fn(),
  createTokenMock: vi.fn(),
  sendMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/users', () => ({ getPublicUserById: getUserMock }))
vi.mock('@/lib/passwordTokens', () => ({ createPasswordToken: createTokenMock }))
vi.mock('@/lib/email', () => ({ sendEmail: sendMock }))

import { POST } from '@/app/api/users/[id]/invite/route'

const req = () => new NextRequest('http://localhost/api/users/al-1/invite', { method: 'POST' })
const ctx = (id = 'al-1') => ({ params: Promise.resolve({ id }) })

const RAW = 'TOKEN-CRUDO-abc123'
const ALUMNO_PROPIO = { id: 'al-1', email: 'ana@mail.com', role: 'alumno', teacherId: 'prof-1' }
const ALUMNO_AJENO = { id: 'al-9', email: 'otro@mail.com', role: 'alumno', teacherId: 'prof-OTRO' }
const PROFE = { id: 'prof-2', email: 'profe@mail.com', role: 'profesor', teacherId: null }

const asAlumno = () => authMock.mockResolvedValue({ user: { id: 'al-x', role: 'alumno' } })
const asProfe = (id = 'prof-1') => authMock.mockResolvedValue({ user: { id, role: 'profesor' } })
const asAdmin = () => authMock.mockResolvedValue({ user: { id: 'ad-1', role: 'admin' } })

beforeEach(() => {
  authMock.mockReset()
  getUserMock.mockReset().mockResolvedValue(ALUMNO_PROPIO)
  createTokenMock.mockReset().mockResolvedValue({ raw: RAW, expiresAt: new Date('2026-10-01T00:00:00Z') })
  sendMock.mockReset().mockResolvedValue({ ok: true, mode: 'resend', id: 're_1' })
})

describe('permisos', () => {
  it('401 sin sesión', async () => {
    authMock.mockResolvedValue(null)
    const res = await POST(req(), ctx())
    expect(res.status).toBe(401)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('403 alumno (no puede invitar a nadie)', async () => {
    asAlumno()
    const res = await POST(req(), ctx())
    expect(res.status).toBe(403)
    expect(createTokenMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('404 si el usuario no existe', async () => {
    asProfe()
    getUserMock.mockResolvedValue(null)
    const res = await POST(req(), ctx('fantasma'))
    expect(res.status).toBe(404)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('INVARIANTE: el profe NO puede invitar a un alumno AJENO → 403, sin mail', async () => {
    asProfe('prof-1')
    getUserMock.mockResolvedValue(ALUMNO_AJENO)
    const res = await POST(req(), ctx('al-9'))
    expect(res.status).toBe(403)
    expect(createTokenMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('INVARIANTE: el profe NO puede invitar a otro profe → 403', async () => {
    asProfe('prof-1')
    getUserMock.mockResolvedValue(PROFE)
    expect((await POST(req(), ctx('prof-2'))).status).toBe(403)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('el profe SÍ puede invitar a su propio alumno', async () => {
    asProfe('prof-1')
    const res = await POST(req(), ctx())
    expect(res.status).toBe(200)
    expect(sendMock).toHaveBeenCalled()
  })

  it('el admin puede invitar a cualquiera, incluso a un profe', async () => {
    asAdmin()
    getUserMock.mockResolvedValue(PROFE)
    const res = await POST(req(), ctx('prof-2'))
    expect(res.status).toBe(200)
    expect(sendMock.mock.calls[0][0].to).toBe('profe@mail.com')
  })
})

describe('fail-closed', () => {
  it('usuario SIN ROL → 400 y no se manda nada (no puede entrar igual)', async () => {
    asAdmin()
    getUserMock.mockResolvedValue({ ...ALUMNO_PROPIO, role: null })
    const res = await POST(req(), ctx())
    expect(res.status).toBe(400)
    expect(createTokenMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('usuario sin email → 400', async () => {
    asAdmin()
    getUserMock.mockResolvedValue({ ...ALUMNO_PROPIO, email: null })
    expect((await POST(req(), ctx())).status).toBe(400)
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('el mail que sale', () => {
  it('emite un token de tipo invite para ESE usuario', async () => {
    asProfe('prof-1')
    await POST(req(), ctx())
    expect(createTokenMock).toHaveBeenCalledWith('al-1', 'invite')
  })

  it('el link lleva el token crudo y apunta a /set-password', async () => {
    asProfe('prof-1')
    await POST(req(), ctx())
    const sent = sendMock.mock.calls[0][0]
    expect(sent.to).toBe('ana@mail.com')
    expect(sent.text).toContain('/set-password?token=' + encodeURIComponent(RAW))
    expect(sent.subject).toMatch(/Activá tu cuenta/)
  })

  it('INVARIANTE: el token crudo viaja SOLO en el mail, nunca en la respuesta HTTP', async () => {
    asProfe('prof-1')
    const res = await POST(req(), ctx())
    const body = await res.text()
    expect(body).not.toContain(RAW)
  })
})

describe('resultado del envío', () => {
  it('informa delivered:true cuando salió', async () => {
    asProfe('prof-1')
    const body = await (await POST(req(), ctx())).json()
    expect(body).toMatchObject({ ok: true, delivered: true })
  })

  it('si la barrera de pruebas lo frena, sigue 200 pero delivered:false con el motivo', async () => {
    asProfe('prof-1')
    sendMock.mockResolvedValue({ ok: false, reason: 'allowlist' })
    const res = await POST(req(), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, delivered: false, reason: 'allowlist' })
  })
})
