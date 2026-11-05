// Login con contraseña (2026-11): la cookie tiene que llamarse igual que la de Auth.js.
import { describe, it, expect } from 'vitest'
import { isSecureRequest, sessionCookieName, sessionCookieOptions } from '@/lib/sessionCookie'
import { createThrottle } from '@/lib/loginThrottle'

describe('cookie de sesión', () => {
  it('nombre: __Secure- en https, sin prefijo en http', () => {
    expect(sessionCookieName(true)).toBe('__Secure-authjs.session-token')
    expect(sessionCookieName(false)).toBe('authjs.session-token')
  })
  it('opciones: httpOnly, lax, path /', () => {
    const exp = new Date('2026-12-01T00:00:00Z')
    expect(sessionCookieOptions(true, exp)).toEqual({ httpOnly: true, sameSite: 'lax', path: '/', secure: true, expires: exp })
  })
  it('https por x-forwarded-proto o por la URL', () => {
    expect(isSecureRequest('http://x/api/login', 'https')).toBe(true)
    expect(isSecureRequest('http://x/api/login', 'http')).toBe(false)
    expect(isSecureRequest('https://x/api/login', null)).toBe(true)
    expect(isSecureRequest('http://localhost/api/login', null)).toBe(false)
  })
})

describe('freno de intentos', () => {
  it('a los 5 fallos bloquea 5 minutos; un acierto limpia', () => {
    const t = createThrottle(5, 300_000)
    for (let i = 0; i < 4; i++) t.fail('ana', 1000)
    expect(t.blockedFor('ana', 1000)).toBe(0)
    t.fail('ana', 1000)
    expect(t.blockedFor('ana', 1000)).toBe(300_000)
    expect(t.blockedFor('ana', 301_000)).toBe(0)
    expect(t.blockedFor('otro', 1000)).toBe(0)
    t.fail('beto', 0); t.ok('beto')
    for (let i = 0; i < 4; i++) t.fail('beto', 0)
    expect(t.blockedFor('beto', 0)).toBe(0)
  })
})
