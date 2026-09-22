// @vitest-environment node
// Contadores anti fuerza bruta / anti bombardeo (lib/loginThrottle.ts).
// La ATOMICIDAD real (ráfagas en paralelo) no se puede probar con la base mockeada:
// se verificó EN VIVO contra la base de PRUEBAS (F4): 12 y 50 intentos simultáneos
// contra un límite de 5 → exactamente 5 evaluados. Acá se fija la forma de la
// sentencia (una sola, con RETURNING) y cómo se interpreta lo que devuelve la base.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDbChain } from '../mocks/db-chain'

const chain = vi.hoisted(() => ({ current: null as any }))
vi.mock('@/lib/db', () => ({ db: new Proxy({}, { get: (_t, p) => chain.current[p] }) }))

import {
  EMAIL_MAX_FAILS,
  IP_MAX_FAILS,
  LOCK_MINUTES,
  RESET_EMAIL_MAX,
  RESET_IP_MAX,
  RESET_LOCK_MINUTES,
  RESET_WINDOW_MINUTES,
  WINDOW_MINUTES,
  clearFailures,
  emailKey,
  hit,
  ipKey,
  release,
  resetEmailKey,
  resetIpKey,
} from '@/lib/loginThrottle'
import * as throttle from '@/lib/loginThrottle'

let dbRow: { fails: number | string; locked: boolean }
beforeEach(() => {
  chain.current = createDbChain()
  dbRow = { fails: 1, locked: false }
  chain.current.execute = vi.fn(() => Promise.resolve({ rows: [dbRow] }))
})

// Texto SQL (sin parámetros) y valores interpolados, recorriendo SQL anidados.
const text = (q: any): string =>
  (q?.queryChunks ?? []).map((c: any) =>
    c && typeof c === 'object' && 'queryChunks' in c ? text(c)
      : c && typeof c === 'object' && Array.isArray(c.value) ? c.value.join('')
      : '').join('')
const params = (q: any): unknown[] =>
  (q?.queryChunks ?? []).flatMap((c: any) =>
    c && typeof c === 'object' && 'queryChunks' in c ? params(c)
      : c && typeof c === 'object' && Array.isArray(c.value) ? []
      : [c])
const lastQuery = () => chain.current.execute.mock.calls.at(-1)[0]

describe('parámetros acordados', () => {
  it('login: 5 por email, 20 por IP, ventana y bloqueo de 15 minutos', () => {
    expect([EMAIL_MAX_FAILS, IP_MAX_FAILS, WINDOW_MINUTES, LOCK_MINUTES]).toEqual([5, 20, 15, 15])
  })

  it('reset: 3 por email, 10 por IP, por hora', () => {
    expect([RESET_EMAIL_MAX, RESET_IP_MAX, RESET_WINDOW_MINUTES, RESET_LOCK_MINUTES]).toEqual([3, 10, 60, 60])
  })

  it('claves con prefijo: email/IP y login/reset nunca chocan entre sí', () => {
    const keys = [emailKey('a@b.com'), ipKey('1.1.1.1'), resetEmailKey('a@b.com'), resetIpKey('1.1.1.1')]
    expect(keys).toEqual(['email:a@b.com', 'ip:1.1.1.1', 'reset-email:a@b.com', 'reset-ip:1.1.1.1'])
    expect(new Set(keys).size).toBe(4)
  })

  it('INVARIANTE: ya no existe la API "chequear y después contar" (era la que tenía la carrera)', () => {
    expect('lockedUntil' in throttle).toBe(false)
    expect('registerFailure' in throttle).toBe(false)
  })
})

describe('hit — contar y decidir en UNA sentencia', () => {
  it('es una sola sentencia INSERT … ON CONFLICT DO UPDATE … RETURNING (atómica)', async () => {
    await hit('email:a@b.com', 5)
    expect(chain.current.execute).toHaveBeenCalledTimes(1)
    const sql = text(lastQuery())
    expect(sql).toMatch(/INSERT INTO login_throttle/)
    expect(sql).toMatch(/ON CONFLICT \(key\) DO UPDATE/)
    expect(sql).toMatch(/RETURNING fails/)
    // No hay un SELECT previo aparte: la decisión sale de lo que devuelve el upsert.
    expect(chain.current.select).not.toHaveBeenCalled()
  })

  it('dentro del límite y sin bloqueo → true', async () => {
    dbRow = { fails: 5, locked: false }
    expect(await hit('email:a@b.com', 5)).toBe(true)
  })

  it('se pasó del límite → false', async () => {
    dbRow = { fails: 6, locked: true }
    expect(await hit('email:a@b.com', 5)).toBe(false)
  })

  it('bloqueo vigente aunque el número diga que entra → false', async () => {
    dbRow = { fails: 1, locked: true }
    expect(await hit('email:a@b.com', 5)).toBe(false)
  })

  it('la base puede devolver el número como string (bigint) → se interpreta bien', async () => {
    dbRow = { fails: '3', locked: false }
    expect(await hit('email:a@b.com', 3)).toBe(true)
    dbRow = { fails: '4', locked: false }
    expect(await hit('email:a@b.com', 3)).toBe(false)
  })

  it('por defecto usa la ventana del login (15/15)', async () => {
    await hit('email:a@b.com', 5)
    const vals = params(lastQuery())
    expect(vals).toContain(15)
    expect(vals).not.toContain(60)
  })

  it('el reset pasa 60/60 y eso es lo que llega al SQL', async () => {
    await hit('reset-email:a@b.com', 3, { windowMinutes: 60, lockMinutes: 60 })
    const vals = params(lastQuery())
    expect(vals).toContain(60)
    expect(vals).not.toContain(15)
    expect(vals).toContain(3)
  })
})

describe('release / clearFailures', () => {
  it('release devuelve UN lugar y nunca baja de 0', async () => {
    await release('ip:1.1.1.1')
    expect(text(lastQuery())).toMatch(/SET fails = greatest\(fails - 1, 0\)/)
    expect(params(lastQuery())).toContain('ip:1.1.1.1')
  })

  it('clearFailures borra solo la clave pedida', async () => {
    await clearFailures('email:a@b.com')
    expect(chain.current.delete).toHaveBeenCalledTimes(1)
  })
})
