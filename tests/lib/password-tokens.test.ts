// @vitest-environment node
// F2 — emisión y consumo de tokens (lib/passwordTokens.ts). La DB está mockeada
// con el chain de tests/mocks/db-chain.ts: acá se verifica QUÉ se manda a la base
// (sobre todo: que viaje el HASH y nunca el token crudo) y el mapeo de la vuelta.
// La semántica atómica real (un solo uso, vencido no consume) se probó además
// contra la base de PRUEBAS con un smoke; ver el informe de F2.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { createDbChain } from '../mocks/db-chain'

const chain = vi.hoisted(() => {
  // createDbChain no se puede llamar en hoisted (importa vitest), así que el
  // objeto se arma acá abajo y se inyecta por referencia.
  return { current: null as any }
})
vi.mock('@/lib/db', () => ({ db: new Proxy({}, { get: (_t, p) => chain.current[p] }) }))

import {
  consumePasswordToken,
  createPasswordToken,
  expiryFor,
  hashToken,
  invalidateTokens,
  peekPasswordToken,
} from '@/lib/passwordTokens'
import { INVITE_TTL_DAYS, RESET_TTL_MINUTES } from '@/lib/emailTemplates'

beforeEach(() => {
  chain.current = createDbChain()
})

describe('hashToken', () => {
  it('es sha256 hex (64 chars) y determinista', () => {
    const h = hashToken('abc')
    expect(h).toBe(createHash('sha256').update('abc').digest('hex'))
    expect(h).toHaveLength(64)
    expect(hashToken('abc')).toBe(h)
  })

  it('INVARIANTE: el hash NO es el token (lo que se guarda no sirve como link)', () => {
    expect(hashToken('mi-token')).not.toBe('mi-token')
  })
})

describe('expiryFor', () => {
  const now = new Date('2026-09-22T12:00:00Z')

  it(`invitación vence en ${INVITE_TTL_DAYS} días`, () => {
    expect(expiryFor('invite', now).toISOString()).toBe('2026-09-29T12:00:00.000Z')
  })

  it(`reset vence en ${RESET_TTL_MINUTES} minutos (corto a propósito)`, () => {
    expect(expiryFor('reset', now).toISOString()).toBe('2026-09-22T13:00:00.000Z')
  })

  it('los plazos salen de emailTemplates: el mail no puede prometer otra cosa', () => {
    const diffDays = (expiryFor('invite', now).getTime() - now.getTime()) / 86400000
    const diffMin = (expiryFor('reset', now).getTime() - now.getTime()) / 60000
    expect(diffDays).toBe(INVITE_TTL_DAYS)
    expect(diffMin).toBe(RESET_TTL_MINUTES)
  })
})

describe('createPasswordToken', () => {
  it('INVARIANTE: a la base va el HASH; el crudo solo vuelve al que llama (para el mail)', async () => {
    const { raw } = await createPasswordToken('u-1', 'invite')
    const inserted = chain.current.values.mock.calls[0][0]
    expect(inserted.tokenHash).toBe(hashToken(raw))
    expect(inserted.tokenHash).not.toBe(raw)
    expect(JSON.stringify(inserted)).not.toContain(raw) // el crudo no aparece en NINGÚN campo
  })

  it('el token crudo son 256 bits en base64url (43 chars, seguro en una URL)', async () => {
    const { raw } = await createPasswordToken('u-1', 'reset')
    expect(raw).toHaveLength(43)
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('dos tokens seguidos son distintos (aleatoriedad real)', async () => {
    const a = await createPasswordToken('u-1', 'invite')
    chain.current = createDbChain()
    const b = await createPasswordToken('u-1', 'invite')
    expect(a.raw).not.toBe(b.raw)
  })

  it('guarda propósito y vencimiento, y devuelve ese mismo vencimiento', async () => {
    const { expiresAt } = await createPasswordToken('u-1', 'invite')
    const inserted = chain.current.values.mock.calls[0][0]
    expect(inserted.purpose).toBe('invite')
    expect(inserted.userId).toBe('u-1')
    expect(inserted.expiresAt).toEqual(expiresAt)
  })

  it('antes de emitir limpia lo viejo y quema los vivos del mismo propósito', async () => {
    await createPasswordToken('u-1', 'invite')
    expect(chain.current.delete).toHaveBeenCalled() // pruneTokens
    expect(chain.current.update).toHaveBeenCalled() // invalidateTokens
    expect(chain.current.set.mock.calls[0][0].usedAt).toBeInstanceOf(Date)
  })
})

describe('peekPasswordToken / consumePasswordToken — entradas basura', () => {
  it('no consultan la base si el token no es un string no vacío', async () => {
    for (const bad of [undefined, null, 123, {}, [], '']) {
      expect(await peekPasswordToken(bad)).toBeNull()
      expect(await consumePasswordToken(bad)).toBeNull()
    }
    expect(chain.current.select).not.toHaveBeenCalled()
    expect(chain.current.update).not.toHaveBeenCalled()
  })
})

describe('consumePasswordToken', () => {
  it('marca used_at y devuelve a quién pertenece el token', async () => {
    chain.current.__rows = [{ userId: 'u-9', purpose: 'reset' }]
    const ref = await consumePasswordToken('tok')
    expect(ref).toEqual({ userId: 'u-9', purpose: 'reset' })
    expect(chain.current.set.mock.calls[0][0].usedAt).toBeInstanceOf(Date)
  })

  it('INVARIANTE un-solo-uso: si el UPDATE no devuelve fila, el token no sirve', async () => {
    chain.current.__rows = [] // ya usado, vencido o inexistente: no se distinguen
    expect(await consumePasswordToken('tok')).toBeNull()
  })
})

describe('peekPasswordToken', () => {
  it('mira sin gastar: consulta pero NO hace update', async () => {
    chain.current.__rows = [{ userId: 'u-1', purpose: 'invite' }]
    expect(await peekPasswordToken('tok')).toEqual({ userId: 'u-1', purpose: 'invite' })
    expect(chain.current.select).toHaveBeenCalled()
    expect(chain.current.update).not.toHaveBeenCalled()
  })

  it('sin fila → null', async () => {
    chain.current.__rows = []
    expect(await peekPasswordToken('tok')).toBeNull()
  })
})

describe('invalidateTokens', () => {
  it('devuelve cuántos quemó', async () => {
    chain.current.__rows = [{ id: 'a' }, { id: 'b' }]
    expect(await invalidateTokens('u-1')).toBe(2)
  })
})
