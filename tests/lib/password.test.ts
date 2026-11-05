// @vitest-environment node
// Cuentas con usuario y contraseña (2026-11): lib/password.ts y lib/passwordRules.ts.
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, dummyHash } from '@/lib/password'
import { makePassword, normalizeEmail, passwordProblem, PASSWORD_ERROR } from '@/lib/passwordRules'

describe('hash de contraseñas (scrypt)', () => {
  it('verifica la buena y rechaza la mala; cada hash lleva su sal', async () => {
    const h1 = await hashPassword('clave-segura-1')
    const h2 = await hashPassword('clave-segura-1')
    expect(h1).toMatch(/^scrypt\$16384\$[^$]+\$[^$]+$/)
    expect(h1).not.toBe(h2)
    expect(h1).not.toContain('clave-segura-1')
    expect(await verifyPassword('clave-segura-1', h1)).toBe(true)
    expect(await verifyPassword('clave-segura-2', h1)).toBe(false)
    expect(await verifyPassword('', h1)).toBe(false)
  })
  it('un hash roto o vacío nunca deja pasar', async () => {
    for (const bad of [null, undefined, '', 'plano', 'bcrypt$1$a$b', 'scrypt$12$a$b', 'scrypt$16384$$']) {
      expect(await verifyPassword('x', bad as string)).toBe(false)
    }
  })
  it('el hash de relleno no coincide con nada razonable', async () => {
    expect(await verifyPassword('', await dummyHash())).toBe(false)
    expect(await verifyPassword('password', await dummyHash())).toBe(false)
  })
})

describe('reglas', () => {
  it('normalizeEmail: minúsculas y sin espacios; null si no es un mail', () => {
    expect(normalizeEmail('  Sofi@Gmail.COM ')).toBe('sofi@gmail.com')
    for (const bad of ['sofi', 'sofi@', '@x.com', 'a b@x.com', 3, null]) expect(normalizeEmail(bad)).toBeNull()
  })
  it('passwordProblem: al menos 8, no solo espacios', () => {
    expect(passwordProblem('12345678')).toBeNull()
    expect(passwordProblem('1234567')).toBe(PASSWORD_ERROR)
    expect(passwordProblem('        ')).toBe(PASSWORD_ERROR)
    expect(passwordProblem(undefined)).toBe(PASSWORD_ERROR)
    expect(passwordProblem('x'.repeat(201))).toMatch(/hasta 200/)
  })
  it('makePassword: 10 caracteres fáciles de dictar y válidos', () => {
    const p = makePassword()
    expect(p).toHaveLength(10)
    expect(p).toMatch(/^[a-zA-Z2-9]+$/)
    expect(p).not.toMatch(/[01lIoO]/)
    expect(passwordProblem(p)).toBeNull()
    expect(makePassword()).not.toBe(p)
  })
})
