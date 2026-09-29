// Calendario (C1) — aplicar y verificar drizzle/0002_calendario.sql.
//
// USO (base de PRUEBAS; la guarda anti-prod frena prod salvo ALLOW_PROD_DB=1 deliberado):
//   dotenv -e .env.development.local -- node drizzle/verify_calendario.mjs apply
//   dotenv -e .env.development.local -- node drizzle/verify_calendario.mjs check
//
// `apply` corre el .sql (idempotente, en una transacción) y después `check`.
// `check` es SOLO LECTURA: compara la base con lo que espera lib/db/schema.ts.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'
import { assertDbHostAllowed } from '../lib/db/guard.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL_UNPOOLED / DATABASE_URL'); process.exit(1) }
const mode = process.argv[2]
if (mode !== 'apply' && mode !== 'check') { console.error('Uso: node drizzle/verify_calendario.mjs <apply|check>'); process.exit(1) }
assertDbHostAllowed(url, 'migration')

// Lo que tiene que haber (espejo de lib/db/schema.ts).
const EXPECTED = {
  class_series: {
    id: ['uuid', false], teacher_id: ['uuid', false], student_id: ['uuid', false],
    weekday: ['integer', false], start_minute: ['integer', false], duration_min: ['integer', false],
    starts_on: ['date', false], ends_on: ['date', true], meet_url: ['text', true],
    created_by: ['uuid', true], created_at: ['timestamp without time zone', false],
  },
  class_events: {
    id: ['uuid', false], teacher_id: ['uuid', false], student_id: ['uuid', false], series_id: ['uuid', true],
    original_starts_at: ['timestamp with time zone', true], starts_at: ['timestamp with time zone', false],
    duration_min: ['integer', false], status: ['USER-DEFINED', false], meet_url: ['text', true],
    created_by: ['uuid', true], created_at: ['timestamp without time zone', false],
  },
}
const EXPECTED_FKS = [
  'class_series.teacher_id→user CASCADE', 'class_series.student_id→user CASCADE', 'class_series.created_by→user SET NULL',
  'class_events.teacher_id→user CASCADE', 'class_events.student_id→user CASCADE', 'class_events.created_by→user SET NULL',
  'class_events.series_id→class_series CASCADE',
]
const EXPECTED_INDEXES = ['class_series_student_teacher_idx', 'class_events_student_teacher_starts_idx', 'class_events_series_original_uq']

const client = new pg.Client({ connectionString: url })
await client.connect()
let bad = 0
const ok = (m) => console.log('  ✓ ' + m)
const fail = (m) => { console.error('  ✗ ' + m); bad++ }

try {
  console.log('Base:', new URL(url).host)
  if (mode === 'apply') {
    await client.query(readFileSync(join(HERE, '0002_calendario.sql'), 'utf8'))
    console.log('0002_calendario.sql aplicado.')
  }

  const { rows: en } = await client.query(
    `SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'class_status' ORDER BY e.enumsortorder`)
  JSON.stringify(en.map((r) => r.enumlabel)) === '["scheduled","cancelled"]'
    ? ok('enum class_status = scheduled, cancelled') : fail('enum class_status: ' + JSON.stringify(en))

  for (const [table, cols] of Object.entries(EXPECTED)) {
    const { rows } = await client.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table])
    const got = Object.fromEntries(rows.map((r) => [r.column_name, [r.data_type, r.is_nullable === 'YES']]))
    const want = JSON.stringify(Object.entries(cols).sort())
    JSON.stringify(Object.entries(got).sort()) === want
      ? ok(`${table}: ${rows.length} columnas con tipo y nulabilidad esperados`)
      : fail(`${table}: columnas distintas\n    esperado ${want}\n    real     ${JSON.stringify(Object.entries(got).sort())}`)
  }

  const { rows: fks } = await client.query(`
    SELECT cl.relname AS tbl, a.attname AS col, rt.relname AS ref,
           CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' ELSE c.confdeltype::text END AS del
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_class rt ON rt.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND cl.relname IN ('class_series', 'class_events')`)
  const gotFks = fks.map((r) => `${r.tbl}.${r.col}→${r.ref} ${r.del}`).sort()
  JSON.stringify(gotFks) === JSON.stringify([...EXPECTED_FKS].sort())
    ? ok(`${gotFks.length} claves foráneas con su ON DELETE`) : fail('FKs: ' + JSON.stringify(gotFks))

  const { rows: idx } = await client.query(
    `SELECT indexname FROM pg_indexes WHERE tablename IN ('class_series', 'class_events')`)
  const names = idx.map((r) => r.indexname)
  EXPECTED_INDEXES.every((n) => names.includes(n))
    ? ok('índices + unique (series_id, original_starts_at)') : fail('índices: ' + JSON.stringify(names))
} finally {
  await client.end()
}
if (bad) { console.error(`\n${bad} chequeo(s) fallaron`); process.exit(1) }
console.log('\nTodo OK')
