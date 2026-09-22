// @vitest-environment node
// F3 — la cookie de sesión que creamos a mano vs la que crea Auth.js.
//
// Estos tests NO comparan contra valores copiados: importan el código REAL de
// Auth.js desde node_modules. Si una actualización de next-auth cambia el nombre
// de la cookie, sus atributos, el maxAge o el generador de tokens, se caen acá —
// antes de que el login con contraseña deje de funcionar en silencio.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const insertValues = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({
  db: { insert: () => ({ values: (v: unknown) => { insertValues(v); return Promise.resolve() } }) },
}))

// Código REAL de Auth.js (ruta interna, no exportada: se importa por archivo;
// trae su propio .d.ts).
import { defaultCookies } from '../../node_modules/@auth/core/lib/utils/cookie.js'
import {
  SESSION_MAX_AGE_SECONDS,
  createDbSession,
  sessionCookieName,
  sessionCookieOptions,
  shouldUseSecureCookies,
} from '@/lib/authCookie'

const AUTH_CORE = resolve(__dirname, '../../node_modules/@auth/core/lib')

describe('nombre y atributos = los de Auth.js (comparado contra su código real)', () => {
  for (const secure of [false, true]) {
    it(`secure=${secure}: mismo nombre`, () => {
      expect(sessionCookieName(secure)).toBe(defaultCookies(secure).sessionToken.name)
    })

    it(`secure=${secure}: mismos atributos (httpOnly, sameSite, path, secure)`, () => {
      const ours = sessionCookieOptions(secure, new Date())
      const { expires: _e, ...oursNoExpiry } = ours
      expect(oursNoExpiry).toEqual(defaultCookies(secure).sessionToken.options)
    })
  }

  it('los valores concretos son los esperados (para leerlos acá, no solo compararlos)', () => {
    expect(sessionCookieName(false)).toBe('authjs.session-token')
    expect(sessionCookieName(true)).toBe('__Secure-authjs.session-token')
    expect(sessionCookieOptions(true, new Date(0))).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
    })
  })
})

describe('tripwires sobre el código fuente de Auth.js', () => {
  const init = readFileSync(resolve(AUTH_CORE, 'init.js'), 'utf8')
  const callback = readFileSync(resolve(AUTH_CORE, 'actions/callback/index.js'), 'utf8')

  it('maxAge por defecto de Auth.js = 30 días = el nuestro', () => {
    expect(init).toMatch(/const maxAge = 30 \* 24 \* 60 \* 60;/)
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60)
  })

  it('Auth.js genera el sessionToken con crypto.randomUUID() (igual que nosotros)', () => {
    expect(init).toMatch(/generateSessionToken: \(\) => crypto\.randomUUID\(\)/)
  })

  it('Auth.js decide secure por el protocolo de la URL (lo que replicamos)', () => {
    expect(init).toMatch(/defaultCookies\(config\.useSecureCookies \?\? url\.protocol === "https:"\)/)
  })

  it('Auth.js pone expires = session.expires en la cookie (estrategia database)', () => {
    expect(callback).toMatch(/\.\.\.options\.cookies\.sessionToken\.options,\s*expires: session\.expires,/)
  })
})

describe('shouldUseSecureCookies — misma derivación que auth() al LEER', () => {
  it('local por http → cookie sin __Secure-', () => {
    const h = new Headers({ host: 'localhost:3000', 'x-forwarded-proto': 'http' })
    expect(shouldUseSecureCookies(h)).toBe(false)
  })

  it('Vercel por https → __Secure-', () => {
    const h = new Headers({ host: 'x.vercel.app', 'x-forwarded-proto': 'https' })
    expect(shouldUseSecureCookies(h)).toBe(true)
  })

  it('sin x-forwarded-proto, Auth.js asume https — y nosotros también', () => {
    const h = new Headers({ host: 'x.vercel.app' })
    expect(shouldUseSecureCookies(h)).toBe(true)
  })
})

describe('createDbSession — la fila que crea el adapter', () => {
  it('token UUID v4, userId y vencimiento a 30 días; devuelve lo mismo que guarda', async () => {
    const before = Date.now()
    const { sessionToken, expires } = await createDbSession('u-1')
    const row = insertValues.mock.calls[0][0]

    expect(sessionToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(row).toEqual({ sessionToken, userId: 'u-1', expires })
    const days = (expires.getTime() - before) / 86400000
    expect(days).toBeGreaterThan(29.99)
    expect(days).toBeLessThan(30.01)
  })
})
