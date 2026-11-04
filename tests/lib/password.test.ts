// @vitest-environment node
// Cuentas con usuario y contraseña (2026-11): lib/password.ts y lib/passwordRules.ts.
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, dummyHash } from '@/lib/password'
import { makePassword, normalizeUsername, passwordProblem, suggestUsername, PASSWORD_ERROR } from '@/lib/passwordRules'

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
  it('normalizeUsername: minúsculas; letras, números, . _ -; de 3 a 30', () => {
    expect(normalizeUsername('  Martina.P ')).toBe('martina.p')
    expect(normalizeUsername('ana_g-2')).toBe('ana_g-2')
    for (const bad of ['ab', 'con espacio', 'ñandu', 'a@b.com', '.punto', 'x'.repeat(31), 3, null]) expect(normalizeUsername(bad)).toBeNull()
  })
  it('passwordProblem: al menos 8, no solo espacios', () => {
    expect(passwordProblem('12345678')).toBeNull()
    expect(passwordProblem('1234567')).toBe(PASSWORD_ERROR)
    expect(passwordProblem('        ')).toBe(PASSWORD_ERROR)
    expect(passwordProblem(undefined)).toBe(PASSWORD_ERROR)
    expect(passwordProblem('x'.repeat(201))).toMatch(/hasta 200/)
  })
  it('suggestUsername: nombre.apellido sin tildes', () => {
    expect(suggestUsername('Martina Pérez')).toBe('martina.perez')
    expect(suggestUsername('  José María  Núñez ')).toBe('jose.nunez')
    expect(suggestUsername('Ana')).toBe('ana')
    expect(suggestUsername('')).toBe('')
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
