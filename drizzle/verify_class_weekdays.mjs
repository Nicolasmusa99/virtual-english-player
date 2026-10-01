// Horario en varios días (G1) — aplicar y verificar drizzle/0004_class_weekdays.sql.
//
// USO (base de PRUEBAS; la guarda anti-prod frena prod salvo ALLOW_PROD_DB=1 deliberado):
//   dotenv -e .env.development.local -- node drizzle/verify_class_weekdays.mjs apply
//   dotenv -e .env.development.local -- node drizzle/verify_class_weekdays.mjs check
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
if (mode !== 'apply' && mode !== 'check') { console.error('Uso: node drizzle/verify_class_weekdays.mjs <apply|check>'); process.exit(1) }
assertDbHostAllowed(url, 'migration')

const client = new pg.Client({ connectionString: url })
await client.connect()
let bad = 0
const ok = (cond, msg, extra = '') => { if (cond) console.log('  ✓ ' + msg); else { console.error('  ✗ ' + msg + (extra ? ' — ' + extra : '')); bad++ } }
try {
  console.log('Base:', new URL(url).host)
  const counts = async () => (await client.query(
    'SELECT (SELECT count(*)::int FROM class_series) AS s, (SELECT count(*)::int FROM class_events) AS e')).rows[0]
  const before = await counts()
  if (mode === 'apply') {
    await client.query(readFileSync(join(HERE, '0004_class_weekdays.sql'), 'utf8'))
    console.log('0004_class_weekdays.sql aplicado.')
  }
  const { rows: col } = await client.query(
    `SELECT data_type, udt_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'class_series' AND column_name = 'weekdays'`)
  ok(col.length === 1 && col[0].data_type === 'ARRAY' && col[0].udt_name === '_int2' && col[0].is_nullable === 'YES',
    'class_series.weekdays smallint[] NULL', JSON.stringify(col))
  const { rows: chk } = await client.query(
    `SELECT 1 FROM pg_constraint WHERE conname = 'class_series_weekdays_ok' AND conrelid = 'class_series'::regclass`)
  ok(chk.length === 1, 'CHECK class_series_weekdays_ok')
  if (col.length === 1) { // sin la columna (check antes de aplicar) no hay nada más que mirar
    const { rows: [miss] } = await client.query(
      'SELECT count(*)::int AS n FROM class_series WHERE weekdays IS NULL OR NOT (weekday = ANY(weekdays))')
    ok(miss.n === 0, 'todos los horarios tienen weekdays e incluyen su weekday', `${miss.n} sin llenar`)
  }
  const after = await counts()
  ok(after.s === before.s && after.e === before.e, `horarios y clases intactos (${after.s} / ${after.e})`)
} finally {
  await client.end()
}
if (bad) { console.error(`\n${bad} chequeo(s) fallaron`); process.exit(1) }
console.log('\nTodo OK')
