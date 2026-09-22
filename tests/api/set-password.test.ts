// @vitest-environment node
// F2 — POST/GET /api/auth/set-password. La política de contraseñas y el hash
// corren DE VERDAD (lib/password); se mockean los tokens y el acceso a usuarios.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  peekMock, consumeMock, invalidateMock,
  getUserMock, setPasswordMock, deleteSessionsMock,
} = vi.hoisted(() => ({
  peekMock: vi.fn(), consumeMock: vi.fn(), invalidateMock: vi.fn(),
  getUserMock: vi.fn(), setPasswordMock: vi.fn(), deleteSessionsMock: vi.fn(),
}))

vi.mock('@/lib/passwordTokens', () => ({
  peekPasswordToken: peekMock,
  consumePasswordToken: consumeMock,
  invalidateTokens: invalidateMock,
}))
vi.mock('@/lib/users', () => ({
  getPublicUserById: getUserMock,
  setUserPassword: setPasswordMock,
  deleteAuthSessions: deleteSessionsMock,
}))

import { GET, POST } from '@/app/api/auth/set-password/route'

const GOOD = 'caballo-correcto-bat'
const post = (body: unknown) =>
  new NextRequest('http://localhost/api/auth/set-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
const get = (qs = '') => new NextRequest(`http://localhost/api/auth/set-password${qs}`)

const ALUMNO = { id: 'u-1', email: 'ana@mail.com', role: 'alumno', teacherId: 'p-1' }

beforeEach(() => {
  peekMock.mockReset().mockResolvedValue({ userId: 'u-1', purpose: 'invite' })
  consumeMock.mockReset().mockResolvedValue({ userId: 'u-1', purpose: 'invite' })
  invalidateMock.mockReset().mockResolvedValue(0)
  getUserMock.mockReset().mockResolvedValue(ALUMNO)
  setPasswordMock.mockReset().mockResolvedValue(undefined)
  deleteSessionsMock.mockReset().mockResolvedValue(0)
})

describe('POST — camino feliz', { timeout: 30000 }, () => {
  it('pone la contraseña, marca todo y cierra las sesiones vivas', async () => {
    const res = await POST(post({ token: 'tok', password: GOOD }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    // Se guarda un hash bcrypt, JAMÁS el texto plano.
    const [userId, hash] = setPasswordMock.mock.calls[0]
    expect(userId).toBe('u-1')
    expect(hash).toMatch(/^\$2[aby]\$12\$/)
    expect(hash).not.toContain(GOOD)

    expect(consumeMock).toHaveBeenCalledWith('tok')
    expect(invalidateMock).toHaveBeenCalledWith('u-1') // quema los otros links
    expect(deleteSessionsMock).toHaveBeenCalledWith('u-1') // echa al que estuviera dentro
  })

  it('INVARIANTE: la respuesta no devuelve email, rol ni nada de la cuenta', async () => {
    const body = await (await POST(post({ token: 'tok', password: GOOD }))).json()
    expect(Object.keys(body)).toEqual(['ok'])
    expect(JSON.stringify(body)).not.toContain('ana@mail.com')
  })

  it('INVARIANTE: consumir el token NO crea sesión (no es un login)', async () => {
    const res = await POST(post({ token: 'tok', password: GOOD }))
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})

describe('POST — links que no sirven', () => {
  it('body inválido → 400 sin tocar nada', async () => {
    const res = await POST(post('no-soy-json-objeto'))
    expect(res.status).toBe(400)
    expect(peekMock).not.toHaveBeenCalled()
  })

  it('token inexistente/usado/vencido → 400 y NO se consume', async () => {
    peekMock.mockResolvedValue(null)
    const res = await POST(post({ token: 'tok', password: GOOD }))
    expect(res.status).toBe(400)
    expect(consumeMock).not.toHaveBeenCalled()
    expect(setPasswordMock).not.toHaveBeenCalled()
  })

  it('INVARIANTE anti-sondeo: token inexistente y token vencido dan la MISMA respuesta', async () => {
    peekMock.mockResolvedValue(null)
    const a = await POST(post({ token: 'no-existe', password: GOOD }))
    const b = await POST(post({ token: 'vencido', password: GOOD }))
    expect(a.status).toBe(b.status)
    expect(await a.json()).toEqual(await b.json())
  })

  it('FAIL-CLOSED: usuario borrado → 400 y se queman sus tokens', async () => {
    getUserMock.mockResolvedValue(null)
    const res = await POST(post({ token: 'tok', password: GOOD }))
    expect(res.status).toBe(400)
    expect(invalidateMock).toHaveBeenCalledWith('u-1')
    expect(setPasswordMock).not.toHaveBeenCalled()
  })

  it('FAIL-CLOSED: usuario SIN ROL → 400 (no se debilita la allowlist de Fase 1)', async () => {
    getUserMock.mockResolvedValue({ ...ALUMNO, role: null })
    const res = await POST(post({ token: 'tok', password: GOOD }))
    expect(res.status).toBe(400)
    expect(setPasswordMock).not.toHaveBeenCalled()
    expect(consumeMock).not.toHaveBeenCalled()
  })

  it('carrera: si otro consumió el token en el medio → 400, no se guarda nada', async () => {
    consumeMock.mockResolvedValue(null)
    const res = await POST(post({ token: 'tok', password: GOOD }))
    expect(res.status).toBe(400)
    expect(setPasswordMock).not.toHaveBeenCalled()
  })
})

describe('POST — política de contraseña', () => {
  it('INVARIANTE: si la contraseña no cumple, el token NO se gasta (puede reintentar)', async () => {
    const res = await POST(post({ token: 'tok', password: 'corta' }))
    expect(res.status).toBe(400)
    expect(consumeMock).not.toHaveBeenCalled()
    expect(setPasswordMock).not.toHaveBeenCalled()
  })

  it('rechaza una contraseña común', async () => {
    const res = await POST(post({ token: 'tok', password: 'password123' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/común/)
  })

  it('rechaza una contraseña que contiene el email de la cuenta', async () => {
    const res = await POST(post({ token: 'tok', password: 'ana-clave-larguita' })) // ana@mail.com
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/email/)
  })

  it('rechaza contraseña ausente o de otro tipo', async () => {
    for (const bad of [undefined, null, 12345678901, { a: 1 }]) {
      const res = await POST(post({ token: 'tok', password: bad }))
      expect(res.status).toBe(400)
    }
    expect(setPasswordMock).not.toHaveBeenCalled()
  })

  it('el error de política nunca devuelve la contraseña', async () => {
    const secret = 'qwertyuiop'
    const body = await (await POST(post({ token: 'tok', password: secret }))).json()
    expect(JSON.stringify(body)).not.toContain(secret)
  })
})

describe('GET — ¿muestro el formulario?', () => {
  it('token bueno → valid:true + propósito, sin datos de la cuenta', async () => {
    const res = await GET(get('?token=tok'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ valid: true, purpose: 'invite' })
    expect(JSON.stringify(body)).not.toContain('ana@mail.com')
  })

  it('no gasta el token', async () => {
    await GET(get('?token=tok'))
    expect(consumeMock).not.toHaveBeenCalled()
  })

  it('sin token → 400 valid:false', async () => {
    peekMock.mockResolvedValue(null)
    const res = await GET(get())
    expect(res.status).toBe(400)
    expect((await res.json()).valid).toBe(false)
  })

  it('usuario sin rol → 400 valid:false', async () => {
    getUserMock.mockResolvedValue({ ...ALUMNO, role: null })
    const res = await GET(get('?token=tok'))
    expect(res.status).toBe(400)
    expect((await res.json()).valid).toBe(false)
  })
})

describe('F4 — reset exitoso (token de propósito "reset")', { timeout: 30000 }, () => {
  beforeEach(() => {
    peekMock.mockResolvedValue({ userId: 'u-1', purpose: 'reset' })
    consumeMock.mockResolvedValue({ userId: 'u-1', purpose: 'reset' })
  })

  it('INVARIANTE: EXPULSA a quien esté dentro — borra TODAS las sesiones vivas de la cuenta', async () => {
    deleteSessionsMock.mockResolvedValue(3) // p. ej. un atacante con la contraseña vieja + 2 dispositivos
    const res = await POST(post({ token: 'tok', password: GOOD }))
    expect(res.status).toBe(200)
    expect(deleteSessionsMock).toHaveBeenCalledTimes(1)
    expect(deleteSessionsMock).toHaveBeenCalledWith('u-1')
  })

  it('y quema los demás links vivos (otro reset pedido antes, una invitación vieja)', async () => {
    await POST(post({ token: 'tok', password: GOOD }))
    expect(invalidateMock).toHaveBeenCalledWith('u-1') // sin propósito = TODOS
  })

  it('las sesiones se borran DESPUÉS de guardar la contraseña nueva (nunca queda la cuenta sin salida)', async () => {
    await POST(post({ token: 'tok', password: GOOD }))
    const saved = setPasswordMock.mock.invocationCallOrder[0]
    const killed = deleteSessionsMock.mock.invocationCallOrder[0]
    expect(saved).toBeLessThan(killed)
  })

  it('GET informa purpose "reset" (para que la pantalla diga "elegí una NUEVA")', async () => {
    const body = await (await GET(get('?token=tok'))).json()
    expect(body).toEqual({ valid: true, purpose: 'reset' })
  })
})
