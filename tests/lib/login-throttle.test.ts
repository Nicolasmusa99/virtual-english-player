// @vitest-environment node
// F3 — contadores de fuerza bruta (lib/loginThrottle.ts). La semántica del SQL
// atómico (ventana, bloqueo, reinicio) se probó además contra la base de PRUEBAS.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDbChain } from '../mocks/db-chain'

const chain = vi.hoisted(() => ({ current: null as any }))
vi.mock('@/lib/db', () => ({ db: new Proxy({}, { get: (_t, p) => chain.current[p] }) }))

import {
  EMAIL_MAX_FAILS,
  IP_MAX_FAILS,
  LOCK_MINUTES,
  WINDOW_MINUTES,
  clearFailures,
  emailKey,
  ipKey,
  lockedUntil,
  registerFailure,
} from '@/lib/loginThrottle'

beforeEach(() => {
  chain.current = createDbChain()
  chain.current.execute = vi.fn(() => Promise.resolve({ rows: [] }))
})

describe('parámetros acordados', () => {
  it('5 fallos por email, 20 por IP, ventana y bloqueo de 15 minutos', () => {
    expect(EMAIL_MAX_FAILS).toBe(5)
    expect(IP_MAX_FAILS).toBe(20)
    expect(WINDOW_MINUTES).toBe(15)
    expect(LOCK_MINUTES).toBe(15)
  })

  it('claves con prefijo: un email y una IP nunca chocan', () => {
    expect(emailKey('a@b.com')).toBe('email:a@b.com')
    expect(ipKey('1.2.3.4')).toBe('ip:1.2.3.4')
  })
})

describe('lockedUntil', () => {
  it('sin claves no consulta', async () => {
    expect(await lockedUntil([])).toBeNull()
    expect(chain.current.select).not.toHaveBeenCalled()
  })

  it('sin filas bloqueadas → null (se puede intentar)', async () => {
    chain.current.__rows = []
    expect(await lockedUntil(['email:a@b.com', 'ip:1.1.1.1'])).toBeNull()
  })

  it('con bloqueos → devuelve el MÁS LEJANO', async () => {
    const a = new Date(Date.now() + 60_000)
    const b = new Date(Date.now() + 600_000)
    chain.current.__rows = [{ until: a }, { until: b }]
    expect(await lockedUntil(['email:a@b.com', 'ip:1.1.1.1'])).toEqual(b)
  })
})

describe('registerFailure', () => {
  it('es UNA sola sentencia (INSERT … ON CONFLICT): atómica frente a intentos simultáneos', async () => {
    await registerFailure('email:a@b.com', 5)
    expect(chain.current.execute).toHaveBeenCalledTimes(1)
    const q = chain.current.execute.mock.calls[0][0]
    const text = q.queryChunks.map((c: any) => (typeof c === 'object' && 'value' in c ? c.value.join('') : '')).join('')
    expect(text).toMatch(/INSERT INTO login_throttle/)
    expect(text).toMatch(/ON CONFLICT \(key\) DO UPDATE/)
  })
})

describe('clearFailures', () => {
  it('borra solo la clave pedida', async () => {
    await clearFailures('email:a@b.com')
    expect(chain.current.delete).toHaveBeenCalledTimes(1)
  })
})
