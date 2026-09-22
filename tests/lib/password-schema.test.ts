// @vitest-environment node
// F0 login con contraseña — invariantes a nivel SCHEMA (sin DB → CI-safe).
// Se verifica con getTableConfig lo que el DDL tiene que cumplir sí o sí:
// cascade, unicidad del token, nulabilidad, y que el hash no se filtre por la API.
import { describe, it, expect, vi } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'

// Solo queremos las CONSTANTES de lib/users (PUBLIC_COLS), no su acceso a datos:
// mockeamos la conexión para no necesitar DATABASE_URL en la suite.
vi.mock('@/lib/db', () => ({ db: {} }))

const { passwordTokenPurpose, passwordTokens, users } = await import('@/lib/db/schema')
const { PUBLIC_COLS } = await import('@/lib/users')

const tokens = getTableConfig(passwordTokens)
const col = (name: string) => tokens.columns.find((c) => c.name === name)

describe('user.password_hash', () => {
  const userCols = getTableConfig(users).columns
  const hash = userCols.find((c) => c.name === 'password_hash')

  it('existe y es NULLABLE (NULL = todavía sin contraseña, entra solo con Google)', () => {
    expect(hash).toBeDefined()
    expect(hash!.notNull).toBe(false)
  })

  it('INVARIANTE anti-fuga: passwordHash NO está en las columnas públicas de /api/users', () => {
    expect(Object.keys(PUBLIC_COLS)).not.toContain('passwordHash')
    expect(Object.values(PUBLIC_COLS).map((c) => c.name)).not.toContain('password_hash')
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
