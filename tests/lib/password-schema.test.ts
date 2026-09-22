// @vitest-environment node
// F0 login con contraseña — invariantes a nivel SCHEMA (sin DB → CI-safe).
// Se verifica con getTableConfig lo que el DDL tiene que cumplir sí o sí:
// cascade, unicidad del token, nulabilidad, y que el hash no se filtre por la API.
import { describe, it, expect, vi } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'

// Solo queremos las CONSTANTES de lib/users (PUBLIC_COLS), no su acceso a datos:
// mockeamos la conexión para no necesitar DATABASE_URL en la suite.
vi.mock('@/lib/db', () => ({ db: {} }))

const { passwordTokenPurpose, passwordTokens, userCredentials, users } = await import('@/lib/db/schema')
const { PUBLIC_COLS } = await import('@/lib/users')

const tokens = getTableConfig(passwordTokens)
const col = (name: string) => tokens.columns.find((c) => c.name === name)

describe('INVARIANTE: la tabla `user` NO guarda credenciales (F3)', () => {
  // El adapter de Auth.js lee TODAS las columnas de `user` (getSessionAndUser,
  // getUser, getUserByEmail…). En F0 el hash vivía acá y la verificación en vivo
  // de F3 lo encontró en /api/auth/session. Estos tests impiden que vuelva.
  const userCols = getTableConfig(users).columns.map((c) => c.name)

  it('no hay columna password_hash en `user`', () => {
    expect(userCols).not.toContain('password_hash')
  })

  it('ninguna columna de `user` tiene nombre de credencial', () => {
    for (const name of userCols) {
      expect(name, name).not.toMatch(/pass|hash|secret|credential|salt/i)
    }
  })

  it('passwordHash tampoco está en las columnas públicas de /api/users', () => {
    expect(Object.keys(PUBLIC_COLS)).not.toContain('passwordHash')
    expect(Object.values(PUBLIC_COLS).map((c) => c.name)).not.toContain('password_hash')
  })
})

describe('tabla user_credentials', () => {
  const creds = getTableConfig(userCredentials)
  const ccol = (name: string) => creds.columns.find((c) => c.name === name)

  it('existe como tabla aparte', () => {
    expect(creds.name).toBe('user_credentials')
  })

  it('user_id es la PK → exactamente una credencial por usuario', () => {
    expect(ccol('user_id')!.primary).toBe(true)
  })

  it('INVARIANTE cascade: user_id → user ON DELETE CASCADE (se borra el usuario, se va su hash)', () => {
    const fk = creds.foreignKeys.find((f) => f.reference().columns.some((c) => c.name === 'user_id'))
    expect(fk).toBeDefined()
    expect(fk!.onDelete).toBe('cascade')
  })

  it('password_hash es NOT NULL: sin contraseña = sin fila (no una fila con NULL)', () => {
    expect(ccol('password_hash')!.notNull).toBe(true)
  })
})

describe('tabla password_tokens', () => {
  it('se llama password_tokens y es una tabla PROPIA (no verificationToken del adapter)', () => {
    expect(tokens.name).toBe('password_tokens')
  })

  it('INVARIANTE: token_hash es UNIQUE y NOT NULL (guardamos el hash, nunca el token crudo)', () => {
    const th = col('token_hash')
    expect(th).toBeDefined()
    expect(th!.notNull).toBe(true)
    const unique = th!.isUnique || tokens.uniqueConstraints.some((u) => u.columns.some((c) => c.name === 'token_hash'))
    expect(unique).toBe(true)
  })

  it('INVARIANTE cascade: user_id → user ON DELETE CASCADE (borrar usuario → sus tokens se van)', () => {
    const fk = tokens.foreignKeys.find((f) => f.reference().columns.some((c) => c.name === 'user_id'))
    expect(fk).toBeDefined()
    expect(fk!.onDelete).toBe('cascade')
    expect(col('user_id')!.notNull).toBe(true)
  })

  it('expires_at es NOT NULL (todo token vence sí o sí)', () => {
    expect(col('expires_at')!.notNull).toBe(true)
  })

  it('INVARIANTE un-solo-uso: used_at es NULLABLE (NULL = sin usar)', () => {
    expect(col('used_at')).toBeDefined()
    expect(col('used_at')!.notNull).toBe(false)
  })

  it('purpose es NOT NULL y solo admite invite | reset', () => {
    expect(col('purpose')!.notNull).toBe(true)
    expect(passwordTokenPurpose.enumValues).toEqual(['invite', 'reset'])
  })

  it('hay índice por user_id (para listar/invalidar los tokens de una persona)', () => {
    const byUser = tokens.indexes.some((i) => i.config.columns.some((c) => 'name' in c && c.name === 'user_id'))
    expect(byUser).toBe(true)
  })
})
