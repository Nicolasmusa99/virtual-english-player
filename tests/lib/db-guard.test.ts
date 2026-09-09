// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertDbHostAllowed } from '@/lib/db/guard.mjs'

// URLs de mentira — este test NO abre ninguna conexión, solo ejercita la guarda.
const PROD_URL = 'postgresql://u:p@ep-falling-bonus-ae6p1qnw-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require'
const PROD_URL_UNPOOLED = 'postgresql://u:p@ep-falling-bonus-ae6p1qnw.c-2.us-east-2.aws.neon.tech/neondb'
const TEST_URL = 'postgresql://u:p@ep-sparkling-bonus-aevd98e6-pooler.c-2.us-east-2.aws.neon.tech/neondb'

describe('assertDbHostAllowed — guarda anti-producción', () => {
  const saved = { vercel: process.env.VERCEL_ENV, allow: process.env.ALLOW_PROD_DB }

  beforeEach(() => {
    delete process.env.VERCEL_ENV
    delete process.env.ALLOW_PROD_DB
  })
  afterEach(() => {
    // Restaurar el entorno real para no contaminar otros tests.
    if (saved.vercel === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = saved.vercel
    if (saved.allow === undefined) delete process.env.ALLOW_PROD_DB
    else process.env.ALLOW_PROD_DB = saved.allow
  })

  it('prod + sin señal de entorno (local / db:push / seed) → ABORTA', () => {
    expect(() => assertDbHostAllowed(PROD_URL, 'runtime')).toThrow(/PRODUCCIÓN/)
    expect(() => assertDbHostAllowed(PROD_URL_UNPOOLED, 'migration')).toThrow(/PRODUCCIÓN/)
  })

  it('prod + VERCEL_ENV=preview → ABORTA (un preview nunca usa prod en silencio)', () => {
    process.env.VERCEL_ENV = 'preview'
    expect(() => assertDbHostAllowed(PROD_URL, 'runtime')).toThrow(/PRODUCCIÓN/)
  })

  it('prod + VERCEL_ENV=production → OK (prod real, el deploy no se toca)', () => {
    process.env.VERCEL_ENV = 'production'
    expect(() => assertDbHostAllowed(PROD_URL, 'runtime')).not.toThrow()
  })

  it('prod + ALLOW_PROD_DB=1 → OK (migración/seed deliberado a prod)', () => {
    process.env.ALLOW_PROD_DB = '1'
    expect(() => assertDbHostAllowed(PROD_URL, 'migration')).not.toThrow()
  })

  it('host no-prod (test/local) → OK siempre, en cualquier entorno', () => {
    expect(() => assertDbHostAllowed(TEST_URL, 'runtime')).not.toThrow()
    process.env.VERCEL_ENV = 'preview'
    expect(() => assertDbHostAllowed(TEST_URL, 'runtime')).not.toThrow()
    process.env.VERCEL_ENV = 'production'
    expect(() => assertDbHostAllowed(TEST_URL, 'runtime')).not.toThrow()
    expect(() => assertDbHostAllowed('postgresql://u:p@localhost:5432/db', 'seed')).not.toThrow()
  })

  it('URL vacía/undefined → no aborta (otro chequeo se encarga del faltante)', () => {
    expect(() => assertDbHostAllowed(undefined, 'runtime')).not.toThrow()
    expect(() => assertDbHostAllowed('', 'runtime')).not.toThrow()
  })
})
