// @vitest-environment node
// F0 login con contraseña — política, hash y verificación (lib/password.ts).
// bcrypt cost 12 tarda ~400ms por operación: los tests que hashean de verdad van
// con timeout ampliado y se mantienen al mínimo indispensable.
import { describe, it, expect } from 'vitest'
import {
  BCRYPT_COST,
  DUMMY_HASH,
  PASSWORD_MAX_CHARS,
  PASSWORD_MIN_CHARS,
  hashPassword,
  validatePassword,
  verifyPassword,
} from '@/lib/password'

const OK = 'caballo-correcto-bateria'

describe('validatePassword — largo', () => {
  it('rechaza lo que no es string (body no confiable)', () => {
    for (const bad of [undefined, null, 123, {}, [], true]) {
      expect(validatePassword(bad).ok).toBe(false)
    }
  })

  it('rechaza vacío', () => {
    expect(validatePassword('').ok).toBe(false)
  })

  it(`rechaza menos de ${PASSWORD_MIN_CHARS} caracteres`, () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN_CHARS - 1)).ok).toBe(false)
  })

  it(`acepta exactamente ${PASSWORD_MIN_CHARS} caracteres`, () => {
    expect(validatePassword('abcXY-9kq7').ok).toBe(true)
  })

  it(`acepta exactamente ${PASSWORD_MAX_CHARS} caracteres y rechaza uno más`, () => {
    expect(validatePassword('x7q'.repeat(21) + 'z').ok).toBe(true) // 64
    expect(validatePassword('x7q'.repeat(21) + 'zz').ok).toBe(false) // 65
  })

  it('INVARIANTE bcrypt: rechaza por BYTES (>72) aunque tenga pocos caracteres', () => {
    // 20 emojis = 80 bytes en UTF-8, pero solo 40 unidades de código.
    const res = validatePassword('🙂'.repeat(20))
    expect(res.ok).toBe(false)
    // Si esto pasara, bcrypt truncaría a 72 bytes y dos contraseñas distintas
    // podrían dar el mismo hash.
  })

  it('NO recorta espacios: una frase con espacios es válida', () => {
    expect(validatePassword('una frase con espacios').ok).toBe(true)
    // Espacios al borde cuentan para el largo, no se comen.
    expect(validatePassword('  ' + 'abcXY-9kq7').ok).toBe(true)
  })
})

describe('validatePassword — contraseñas obvias', () => {
  it('rechaza comunes de la lista', () => {
    for (const p of ['password123', 'qwertyuiop', '1234567890', 'iloveyou123']) {
      expect(validatePassword(p), p).toMatchObject({ ok: false })
    }
  })

  it('rechaza una común con ruido al final (password123 → password)', () => {
    expect(validatePassword('qwertyuiop99!').ok).toBe(false)
  })

  it('rechaza si contiene el nombre del sitio', () => {
    expect(validatePassword('VirtualEnglish2026').ok).toBe(false)
    expect(validatePassword('mi-virtual english-!').ok).toBe(false)
  })

  it('rechaza si contiene la parte local del email', () => {
    expect(validatePassword('nicolas-super-clave', { email: 'nicolas@mail.com' }).ok).toBe(false)
    // Case-insensitive en ambos lados.
    expect(validatePassword('XXNICOLASxx-7788', { email: 'Nicolas@mail.com' }).ok).toBe(false)
  })

  it('un email corto (<3) no bloquea media contraseña', () => {
    expect(validatePassword('ab-una-clave-larga', { email: 'ab@mail.com' }).ok).toBe(true)
  })

  it('sin email, la regla de email no aplica', () => {
    expect(validatePassword(OK).ok).toBe(true)
    expect(validatePassword(OK, { email: null }).ok).toBe(true)
  })
})

describe('validatePassword — los errores no filtran nada', () => {
  it('el mensaje de error NUNCA contiene la contraseña', () => {
    const secret = 'qwertyuiop' // cae en la lista de comunes
    const res = validatePassword(secret, { email: 'x@y.com' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).not.toContain(secret)
  })
})

describe('hashPassword / verifyPassword', { timeout: 30000 }, () => {
  it('genera un hash bcrypt con el cost configurado, y NO el texto plano', async () => {
    const hash = await hashPassword(OK)
    expect(hash).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_COST}\\$`))
    expect(hash).not.toContain(OK)
    expect(hash).toHaveLength(60)
  })

  it('la misma contraseña da hashes distintos (salt por fila)', async () => {
    const [a, b] = [await hashPassword(OK), await hashPassword(OK)]
    expect(a).not.toBe(b)
    // …pero ambos verifican.
    expect(await verifyPassword(OK, a)).toBe(true)
    expect(await verifyPassword(OK, b)).toBe(true)
  })

  it('FAIL-CLOSED: hashPassword TIRA si la contraseña no cumple la política', async () => {
    // Aunque una ruta futura se olvide de validar, no se puede guardar una débil.
    await expect(hashPassword('123')).rejects.toThrow(/inválida/)
    await expect(hashPassword('password123')).rejects.toThrow(/inválida/)
  })

  it('verifyPassword: true con la correcta, false con la incorrecta', async () => {
    const hash = await hashPassword(OK)
    expect(await verifyPassword(OK, hash)).toBe(true)
    expect(await verifyPassword(OK + 'x', hash)).toBe(false)
    expect(await verifyPassword('otra-cosa-larga-x', hash)).toBe(false)
  })

  it('INVARIANTE truncado: dos contraseñas de 64 chars que difieren en el último NO se confunden', async () => {
    const a = 'k'.repeat(63) + 'A'
    const b = 'k'.repeat(63) + 'B'
    const hash = await hashPassword(a)
    expect(await verifyPassword(a, hash)).toBe(true)
    expect(await verifyPassword(b, hash)).toBe(false)
  })

  it('sin hash (usuario inexistente o sin contraseña) → false, sin tirar', async () => {
    expect(await verifyPassword(OK, null)).toBe(false)
    expect(await verifyPassword(OK, undefined)).toBe(false)
    expect(await verifyPassword(OK, '')).toBe(false)
  })

  it('hash corrupto en la DB → false, no un 500', async () => {
    expect(await verifyPassword(OK, 'no-soy-un-hash-bcrypt')).toBe(false)
  })

  it('password no-string → false (nunca tira con un body raro)', async () => {
    const hash = await hashPassword(OK)
    // La firma acepta `unknown` a propósito: el body no es confiable. Un objeto
    // con toString() NO debe colarse como si fuera la contraseña.
    expect(await verifyPassword({ toString: () => OK }, hash)).toBe(false)
    expect(await verifyPassword(undefined, hash)).toBe(false)
  })

  it('DUMMY_HASH es un hash bcrypt válido del cost correcto (iguala el timing)', async () => {
    expect(DUMMY_HASH).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_COST}\\$`))
    // Y no coincide con nada que alguien vaya a escribir.
    expect(await verifyPassword(OK, DUMMY_HASH)).toBe(false)
  })
})
