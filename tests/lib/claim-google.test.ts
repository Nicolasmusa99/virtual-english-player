// @vitest-environment node
// 2026-11: la primera vez que alguien entra con Google a una cuenta con contraseña, se le
// saca la contraseña y se cierran sus sesiones (el mail de esas cuentas no se verifica).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ row: null as null | { id: string; h: string | null }, google: false, updates: [] as unknown[], deletes: 0 }))
vi.mock('@/lib/db', () => {
  const chain = (result: () => unknown) => ({ from: () => ({ where: () => Promise.resolve(result()) }) })
  let calls = 0
  return {
    db: {
      select: () => { calls++; return calls % 2 === 1 ? chain(() => (state.row ? [state.row] : [])) : chain(() => (state.google ? [{ p: 'google' }] : [])) },
      update: () => ({ set: (v: unknown) => ({ where: () => { state.updates.push(v); return Promise.resolve() } }) }),
      delete: () => ({ where: () => { state.deletes++; return Promise.resolve() } }),
    },
  }
})
import { claimPasswordAccountByGoogle } from '@/lib/users'

beforeEach(() => { state.row = null; state.google = false; state.updates = []; state.deletes = 0 })

describe('claimPasswordAccountByGoogle', () => {
  it('cuenta con contraseña y sin Google todavía → saca la contraseña y cierra sesiones', async () => {
    state.row = { id: 'u1', h: 'scrypt$...' }
    expect(await claimPasswordAccountByGoogle('a@x.com')).toBe(true)
    expect(state.updates).toEqual([{ passwordHash: null }])
    expect(state.deletes).toBe(1)
  })
  it('sin contraseña, o con Google ya enganchado → no toca nada', async () => {
    state.row = { id: 'u1', h: null }
    expect(await claimPasswordAccountByGoogle('a@x.com')).toBe(false)
    expect(state.updates).toEqual([])
  })
})
