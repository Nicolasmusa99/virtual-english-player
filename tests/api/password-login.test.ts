// @vitest-environment node
// F3 — POST /api/auth/password-login. EL checkpoint fuerte de la fase.
//
// Corre DE VERDAD: bcrypt (lib/password), la política de CSRF, el nombre/atributos
// de la cookie (lib/authCookie). Se mockean solo: la búsqueda del usuario, el
// contador de fuerza bruta y la inserción de la fila de sesión.
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'

const { getUserMock, hitMock, releaseMock, clearMock, createSessionMock, verifySpy } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  hitMock: vi.fn(),
  releaseMock: vi.fn(),
  clearMock: vi.fn(),
  createSessionMock: vi.fn(),
  verifySpy: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/users', () => ({ getUserForLogin: getUserMock }))
vi.mock('@/lib/loginThrottle', async (orig) => ({
  ...(await orig<typeof import('@/lib/loginThrottle')>()),
  hit: hitMock,
  release: releaseMock,
  clearFailures: clearMock,
}))
vi.mock('@/lib/authCookie', async (orig) => ({
  ...(await orig<typeof import('@/lib/authCookie')>()),
  createDbSession: createSessionMock,
}))
// verifyPassword REAL, envuelto en un espía para poder afirmar que bcrypt corrió.
vi.mock('@/lib/password', async (orig) => {
  const real = await orig<typeof import('@/lib/password')>()
  return {
    ...real,
    verifyPassword: (p: unknown, h: string | null | undefined) => {
      verifySpy(p, h)
      return real.verifyPassword(p, h)
    },
  }
})

import { POST } from '@/app/api/auth/password-login/route'

const PASSWORD = 'caballo-correcto-bat'
let HASH = ''
beforeAll(async () => { HASH = await bcrypt.hash(PASSWORD, 12) })

const SESSION_TOKEN = '11111111-2222-4333-8444-555555555555'
const EXPIRES = new Date('2026-10-22T12:00:00Z')

type Opts = { origin?: string | null; host?: string; proto?: string; ip?: string }
function login(body: unknown, o: Opts = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    host: o.host ?? 'localhost:3000',
    'x-forwarded-proto': o.proto ?? 'http',
    'x-forwarded-for': o.ip ?? '9.9.9.9',
  }
  const origin = o.origin === undefined ? `${o.proto ?? 'http'}://${o.host ?? 'localhost:3000'}` : o.origin
  if (origin !== null) headers.origin = origin
  return new NextRequest('http://localhost:3000/api/auth/password-login', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const OK_USER = { id: 'u-1', role: 'alumno', passwordHash: '' }

beforeEach(() => {
  OK_USER.passwordHash = HASH
  getUserMock.mockReset().mockResolvedValue(OK_USER)
  hitMock.mockReset().mockResolvedValue(true) // true = entra dentro del límite
  releaseMock.mockReset().mockResolvedValue(undefined)
  clearMock.mockReset().mockResolvedValue(undefined)
  createSessionMock.mockReset().mockResolvedValue({ sessionToken: SESSION_TOKEN, expires: EXPIRES })
  verifySpy.mockReset()
})

// ─────────────────────────────────────────────────────────────────────────────
describe('login correcto', { timeout: 30000 }, () => {
  it('200 {ok:true}, crea la sesión del usuario y setea la cookie de Auth.js', async () => {
    const res = await POST(login({ email: 'ana@mail.com', password: PASSWORD }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(createSessionMock).toHaveBeenCalledWith('u-1')

    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toContain(`authjs.session-token=${SESSION_TOKEN}`)
    expect(cookie).not.toContain('__Secure-') // local por http
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=lax/i)
    expect(cookie).toMatch(/Path=\//)
    expect(cookie).toContain(`Expires=${EXPIRES.toUTCString()}`) // = expires de la fila
  })

  it('por https (Vercel) la cookie es __Secure- y lleva Secure', async () => {
    const res = await POST(login({ email: 'ana@mail.com', password: PASSWORD }, { host: 'x.vercel.app', proto: 'https' }))
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toContain(`__Secure-authjs.session-token=${SESSION_TOKEN}`)
    expect(cookie).toMatch(/; Secure/i)
  })

  it('normaliza el email (trim + minúsculas) para buscar y para el contador', async () => {
    await POST(login({ email: '  Ana@Mail.COM ', password: PASSWORD }))
    expect(getUserMock).toHaveBeenCalledWith('ana@mail.com')
    expect(hitMock).toHaveBeenCalledWith('email:ana@mail.com', 5)
  })

  it('éxito: borra el contador del EMAIL y DEVUELVE el lugar de la IP (no la borra)', async () => {
    await POST(login({ email: 'ana@mail.com', password: PASSWORD }))
    expect(clearMock).toHaveBeenCalledTimes(1)
    expect(clearMock).toHaveBeenCalledWith('email:ana@mail.com')
    expect(releaseMock).toHaveBeenCalledTimes(1)
    expect(releaseMock).toHaveBeenCalledWith('ip:9.9.9.9')
  })

  it('funciona para los tres roles', async () => {
    for (const role of ['admin', 'profesor', 'alumno']) {
      getUserMock.mockResolvedValue({ ...OK_USER, role })
      expect((await POST(login({ email: 'x@y.com', password: PASSWORD }))).status).toBe(200)
    }
  })

  it('no-leak: la respuesta no trae contraseña, hash, id ni rol; y no se cachea', async () => {
    const res = await POST(login({ email: 'ana@mail.com', password: PASSWORD }))
    const text = await res.text()
    expect(text).not.toContain(PASSWORD)
    expect(text).not.toContain(HASH)
    expect(text).not.toContain('u-1')
    expect(text).not.toContain('alumno')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('los 4 rechazos son INDISTINGUIBLES', { timeout: 60000 }, () => {
  const cases: Array<[string, () => void, string]> = [
    ['no existe la cuenta', () => getUserMock.mockResolvedValue(null), PASSWORD],
    ['existe pero sin contraseña (solo Google)', () => getUserMock.mockResolvedValue({ ...OK_USER, passwordHash: null }), PASSWORD],
    ['contraseña incorrecta', () => {}, 'otra-contraseña-larga'],
    ['contraseña CORRECTA pero rol NULL', () => getUserMock.mockResolvedValue({ ...OK_USER, role: null }), PASSWORD],
  ]

  for (const [name, setup, pw] of cases) {
    it(`${name} → 401 genérico, sin sesión ni cookie; el intento quedó contado ANTES (email e IP)`, async () => {
      setup()
      const res = await POST(login({ email: 'ana@mail.com', password: pw }))
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Email o contraseña incorrectos' })
      expect(res.headers.get('set-cookie')).toBeNull()
      expect(createSessionMock).not.toHaveBeenCalled()
      expect(hitMock).toHaveBeenCalledWith('ip:9.9.9.9', 20)
      expect(hitMock).toHaveBeenCalledWith('email:ana@mail.com', 5)
      expect(clearMock).not.toHaveBeenCalled()
      expect(releaseMock).not.toHaveBeenCalled() // un fallo NO devuelve el lugar
    })
  }

  it('INVARIANTE: las 4 respuestas son byte a byte idénticas (status + cuerpo + headers relevantes)', async () => {
    const snapshots: string[] = []
    for (const [, setup, pw] of cases) {
      getUserMock.mockReset().mockResolvedValue(OK_USER)
      setup()
      const res = await POST(login({ email: 'ana@mail.com', password: pw }))
      snapshots.push(JSON.stringify({
        status: res.status,
        body: await res.text(),
        cookie: res.headers.get('set-cookie'),
        cache: res.headers.get('cache-control'),
      }))
    }
    expect(new Set(snapshots).size).toBe(1)
  })

  it('INVARIANTE timing: bcrypt corre en los 4 casos (con DUMMY_HASH cuando no hay hash)', async () => {
    for (const [, setup, pw] of cases) {
      getUserMock.mockReset().mockResolvedValue(OK_USER)
      verifySpy.mockReset()
      setup()
      const t0 = performance.now()
      await POST(login({ email: 'ana@mail.com', password: pw }))
      const ms = performance.now() - t0
      expect(verifySpy).toHaveBeenCalledTimes(1)
      // Cota inferior robusta: cost 12 nunca baja de ~100ms. Si algún caso saliera
      // "rápido" es que se salteó bcrypt y el tiempo delataría la cuenta.
      expect(ms).toBeGreaterThan(100)
    }
  })

  it('usuario inexistente → verifyPassword recibe hash null (camino DUMMY_HASH)', async () => {
    getUserMock.mockResolvedValue(null)
    await POST(login({ email: 'nadie@mail.com', password: PASSWORD }))
    expect(verifySpy).toHaveBeenCalledWith(PASSWORD, null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('fuerza bruta (conteo atómico ANTES de evaluar)', () => {
  it('email frenado → 429, sin buscar al usuario ni correr bcrypt', async () => {
    hitMock.mockImplementation(async (key: string) => !key.startsWith('email:'))
    const res = await POST(login({ email: 'ana@mail.com', password: PASSWORD }))
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' })
    expect(getUserMock).not.toHaveBeenCalled()
    expect(verifySpy).not.toHaveBeenCalled()
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('frenado + contraseña CORRECTA → igual 429 (el bloqueo no se saltea)', async () => {
    hitMock.mockResolvedValue(false)
    const res = await POST(login({ email: 'ana@mail.com', password: PASSWORD }))
    expect(res.status).toBe(429)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('IP frenada → 429 y NO se gasta el cupo del email (nadie bloquea una cuenta ajena desde una IP ya frenada)', async () => {
    hitMock.mockImplementation(async (key: string) => !key.startsWith('ip:'))
    const res = await POST(login({ email: 'ana@mail.com', password: PASSWORD }))
    expect(res.status).toBe(429)
    expect(hitMock).toHaveBeenCalledTimes(1)
    expect(hitMock).toHaveBeenCalledWith('ip:9.9.9.9', 20)
  })

  it('el intento se cuenta ANTES de correr bcrypt (una ráfaga no puede colarse)', async () => {
    getUserMock.mockResolvedValue(null)
    await POST(login({ email: 'ana@mail.com', password: 'mal-mal-mal-mal' }))
    const lastHit = Math.max(...hitMock.mock.invocationCallOrder)
    const bcryptAt = verifySpy.mock.invocationCallOrder[0]
    expect(lastHit).toBeLessThan(bcryptAt)
  })

  it('ANTI-ENUMERACIÓN: el intento se cuenta AUNQUE la cuenta no exista', async () => {
    getUserMock.mockResolvedValue(null)
    await POST(login({ email: 'inventado@mail.com', password: PASSWORD }))
    expect(hitMock).toHaveBeenCalledWith('email:inventado@mail.com', 5)
  })

  it('la IP sale del primer salto de x-forwarded-for', async () => {
    await POST(login({ email: 'ana@mail.com', password: 'mal-mal-mal-mal' }, { ip: '1.2.3.4, 10.0.0.1' }))
    expect(hitMock).toHaveBeenCalledWith('ip:1.2.3.4', 20)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('CSRF (Origin)', () => {
  it('sin Origin → 403, no se toca nada', async () => {
    const res = await POST(login({ email: 'ana@mail.com', password: PASSWORD }, { origin: null }))
    expect(res.status).toBe(403)
    expect(getUserMock).not.toHaveBeenCalled()
    expect(hitMock).not.toHaveBeenCalled()
  })

  it('Origin de OTRO sitio → 403', async () => {
    const res = await POST(login({ email: 'ana@mail.com', password: PASSWORD }, { origin: 'https://evil.example' }))
    expect(res.status).toBe(403)
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('Origin malformado → 403', async () => {
    const res = await POST(login({ email: 'ana@mail.com', password: PASSWORD }, { origin: 'no es una url' }))
    expect(res.status).toBe(403)
  })

  it('mismo sitio detrás de un proxy (x-forwarded-host) → pasa', async () => {
    const req = new NextRequest('http://interno/api/auth/password-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: 'interno',
        'x-forwarded-host': 'app.vercel.app',
        'x-forwarded-proto': 'https',
        origin: 'https://app.vercel.app',
      },
      body: JSON.stringify({ email: 'ana@mail.com', password: PASSWORD }),
    })
    expect((await POST(req)).status).toBe(200)
  }, 30000)
})

// ─────────────────────────────────────────────────────────────────────────────
describe('body', () => {
  it('no-JSON / no-objeto → 400', async () => {
    expect((await POST(login('no-json'))).status).toBe(400)
  })

  it('email o contraseña que no son string → 400, sin bcrypt', async () => {
    for (const body of [{ email: 1, password: 'x' }, { email: 'a@b.com', password: 123 }, { email: 'a@b.com' }]) {
      expect((await POST(login(body))).status).toBe(400)
    }
    expect(verifySpy).not.toHaveBeenCalled()
  })

  it('tamaños absurdos → 400 antes de tocar base o bcrypt (anti-DoS)', async () => {
    const res1 = await POST(login({ email: 'a'.repeat(400) + '@b.com', password: 'x' }))
    const res2 = await POST(login({ email: 'a@b.com', password: 'x'.repeat(2000) }))
    expect(res1.status).toBe(400)
    expect(res2.status).toBe(400)
    expect(hitMock).not.toHaveBeenCalled()
    expect(verifySpy).not.toHaveBeenCalled()
  })
})
