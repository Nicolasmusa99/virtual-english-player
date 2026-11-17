// Avance en clase (2026-11) — aplicar y verificar drizzle/0008_clase.sql.
//
// USO (base de PRUEBAS; la guarda anti-prod frena prod salvo ALLOW_PROD_DB=1 deliberado):
//   dotenv -e .env.development.local -- node drizzle/verify_clase.mjs apply
//   dotenv -e .env.development.local -- node drizzle/verify_clase.mjs check
// O desde GitHub: gh workflow run migrar-base.yml --ref <rama> -f migracion=clase -f base=pruebas -f modo=apply
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
if (mode !== 'apply' && mode !== 'check') { console.error('Uso: node drizzle/verify_clase.mjs <apply|check>'); process.exit(1) }
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
    await client.query(readFileSync(join(HERE, '0008_clase.sql'), 'utf8'))
    console.log('0008_clase.sql aplicado.')
  }
  const c = Object.fromEntries((await client.query(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'class_progress'`)).rows.map((r) => [r.column_name, r]))
  ok(Object.keys(c).length === 5, 'class_progress existe con 5 columnas', Object.keys(c).join(','))
  ok(c.student_id?.is_nullable === 'NO' && c.video_id?.is_nullable === 'NO', 'student_id y video_id NOT NULL')
  ok(c.teacher_id?.is_nullable === 'YES', 'teacher_id NULL')
  ok(c.position_sec?.data_type === 'real' && c.position_sec?.is_nullable === 'NO', 'position_sec real NOT NULL')
  ok(c.seen_at?.data_type?.startsWith('timestamp'), 'seen_at timestamp')
  const pk = (await client.query(
    `SELECT count(*)::int AS n FROM information_schema.table_constraints
      WHERE table_name = 'class_progress' AND constraint_type = 'PRIMARY KEY'`)).rows[0].n
  ok(pk === 1, 'PK (student_id, video_id)')
  const after = await count()
  ok(after === before, `asignaciones intactas (${after})`)
} finally {
  await client.end()
}
if (bad) { console.error(`\n${bad} chequeo(s) fallaron`); process.exit(1) }
console.log('\nTodo OK')
