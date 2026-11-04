// Cuentas y fotos (2026-11) — aplicar y verificar drizzle/0006_cuentas.sql.
//
// USO (base de PRUEBAS; la guarda anti-prod frena prod salvo ALLOW_PROD_DB=1 deliberado):
//   dotenv -e .env.development.local -- node drizzle/verify_cuentas.mjs apply
//   dotenv -e .env.development.local -- node drizzle/verify_cuentas.mjs check
//
// `check` es SOLO LECTURA. `apply` corre el .sql (idempotente) y después `check`.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'
import { assertDbHostAllowed } from '../lib/db/guard.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL_UNPOOLED / DATABASE_URL'); process.exit(1) }
const mode = process.argv[2]
if (mode !== 'apply' && mode !== 'check') { console.error('Uso: node drizzle/verify_cuentas.mjs <apply|check>'); process.exit(1) }
assertDbHostAllowed(url, 'migration')

const client = new pg.Client({ connectionString: url })
await client.connect()
let bad = 0
const ok = (cond, msg, extra = '') => { if (cond) console.log('  ✓ ' + msg); else { console.error('  ✗ ' + msg + (extra ? ' — ' + extra : '')); bad++ } }
try {
  console.log('Base:', new URL(url).host)
  const count = async () => (await client.query('SELECT count(*)::int AS n FROM "user"')).rows[0].n
  const before = await count()
  if (mode === 'apply') {
    await client.query(readFileSync(join(HERE, '0006_cuentas.sql'), 'utf8'))
    console.log('0006_cuentas.sql aplicado.')
  }
  const u = Object.fromEntries((await client.query(
    `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user'`)).rows.map((r) => [r.column_name, r]))
  ok(u.username?.data_type === 'text' && u.username?.is_nullable === 'YES', 'user.username text NULL')
  ok(u.password_hash?.data_type === 'text' && u.password_hash?.is_nullable === 'YES', 'user.password_hash text NULL')
  ok(u.google_image?.data_type === 'text', 'user.google_image text')
  ok(u.image_custom?.data_type === 'boolean' && u.image_custom?.is_nullable === 'NO', 'user.image_custom boolean NOT NULL')
  const { rows: c } = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = 'user_username_unique'`)
  ok(c.length === 1, 'usuario único (user_username_unique)')
  const { rows: [{ n }] } = await client.query('SELECT count(*)::int AS n FROM "user" WHERE password_hash IS NOT NULL')
  console.log(`  (cuentas con contraseña: ${n})`)
  const after = await count()
  ok(after === before, `usuarios intactos (${after})`)
} finally {
  await client.end()
}
if (bad) { console.error(`\n${bad} chequeo(s) fallaron`); process.exit(1) }
console.log('\nTodo OK')
