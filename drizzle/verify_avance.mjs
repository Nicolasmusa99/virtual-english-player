// Avance del alumno (2026-11) — aplicar y verificar drizzle/0007_avance.sql.
//
// USO (base de PRUEBAS; la guarda anti-prod frena prod salvo ALLOW_PROD_DB=1 deliberado):
//   dotenv -e .env.development.local -- node drizzle/verify_avance.mjs apply
//   dotenv -e .env.development.local -- node drizzle/verify_avance.mjs check
// O desde GitHub: gh workflow run migrar-base.yml --ref <rama> -f migracion=avance -f base=pruebas -f modo=apply
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
if (mode !== 'apply' && mode !== 'check') { console.error('Uso: node drizzle/verify_avance.mjs <apply|check>'); process.exit(1) }
assertDbHostAllowed(url, 'migration')

const client = new pg.Client({ connectionString: url })
await client.connect()
let bad = 0
const ok = (cond, msg, extra = '') => { if (cond) console.log('  ✓ ' + msg); else { console.error('  ✗ ' + msg + (extra ? ' — ' + extra : '')); bad++ } }
try {
  console.log('Base:', new URL(url).host)
  const count = async () => (await client.query('SELECT count(*)::int AS n FROM assignments')).rows[0].n
  const before = await count()
  if (mode === 'apply') {
    await client.query(readFileSync(join(HERE, '0007_avance.sql'), 'utf8'))
    console.log('0007_avance.sql aplicado.')
  }
  const c = Object.fromEntries((await client.query(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'assignments'`)).rows.map((r) => [r.column_name, r]))
  ok(c.last_position_sec?.data_type === 'real' && c.last_position_sec?.is_nullable === 'YES', 'assignments.last_position_sec real NULL')
  ok(c.last_seen_at?.data_type?.startsWith('timestamp') && c.last_seen_at?.is_nullable === 'YES', 'assignments.last_seen_at timestamp NULL')
  const after = await count()
  ok(after === before, `asignaciones intactas (${after})`)
} finally {
  await client.end()
}
if (bad) { console.error(`\n${bad} chequeo(s) fallaron`); process.exit(1) }
console.log('\nTodo OK')
