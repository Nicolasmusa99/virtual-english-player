// @vitest-environment node
/// <reference types="vite/client" />
// Vista del alumno (E1) — MATRIZ DE ACCESO del rol 'alumno'.
// Recorre SOLA todas las rutas de app/api (import.meta.glob) y exige que un alumno
// reciba 403 en cada método de cada una, salvo en sus rutas (/api/student/**) y en
// las de Auth.js. Si mañana se agrega una ruta y se olvida el guard, este test falla.
// La base de datos está reemplazada por una trampa: si alguna ruta la toca antes de
// rechazar al alumno, el test también falla.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

const { authMock, dbTouched } = vi.hoisted(() => ({ authMock: vi.fn(), dbTouched: { value: false } }))
vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/db', () => {
  const trap: object = new Proxy(function () {}, {
    get: () => { dbTouched.value = true; return trap },
    apply: () => { dbTouched.value = true; return trap },
  })
  return { db: trap }
})

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
// Cada caso importa su ruta en frío (Next + sus dependencias): con la suite completa
// en paralelo eso a veces pasa los 5 s por defecto de Vitest. El tiempo extra es solo
// para el import; lo que se verifica (403 y base sin tocar) no cambia.
const ROUTE_TIMEOUT_MS = 30_000

const modules = import.meta.glob('/app/api/**/route.ts')
const guarded = Object.keys(modules)
  .filter((p) => !p.includes('/api/auth/')) // Auth.js (login/logout) es público por diseño
  .filter((p) => !p.includes('/api/student/')) // las rutas del alumno: tests propios
  .sort()

// Parámetros de ruta dinámicos ([id], [videoId]...) → un uuid cualquiera.
const paramsFor = (path: string) =>
  Object.fromEntries([...path.matchAll(/\[(\w+)\]/g)].map((m) => [m[1], '11111111-2222-4333-8444-555555555555']))

beforeAll(() => {
  authMock.mockResolvedValue({ user: { id: 'al-1', role: 'alumno' } })
})

describe('matriz de acceso: el alumno recibe 403 en TODAS las rutas que no son suyas', () => {
  it('hay rutas para revisar (el glob las encontró)', () => {
    expect(guarded.length).toBeGreaterThanOrEqual(10)
  })

  for (const path of guarded) {
    it(path.replace('/app', ''), async () => {
      const mod = (await modules[path]()) as Partial<Record<(typeof METHODS)[number], Handler>>
      const methods = METHODS.filter((m) => typeof mod[m] === 'function')
      expect(methods.length, 'la ruta exporta algún método').toBeGreaterThan(0)
      for (const m of methods) {
        dbTouched.value = false
        const url = 'http://localhost' + path.replace('/app', '').replace('/route.ts', '')
        const req = new NextRequest(url, {
          method: m,
          headers: { 'Content-Type': 'application/json' },
          body: m === 'GET' ? undefined : '{}',
        })
        const res = await mod[m]!(req, { params: Promise.resolve(paramsFor(path)) })
        expect(res.status, `${m} ${url}`).toBe(403)
        expect(dbTouched.value, `${m} ${url} tocó la base antes de rechazar`).toBe(false)
      }
    }, ROUTE_TIMEOUT_MS)
  }
})
