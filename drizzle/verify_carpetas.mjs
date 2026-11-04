// Carpetas (2026-11) — aplicar y verificar drizzle/0005_carpetas.sql.
//
// USO (base de PRUEBAS; la guarda anti-prod frena prod salvo ALLOW_PROD_DB=1 deliberado):
//   dotenv -e .env.development.local -- node drizzle/verify_carpetas.mjs apply
//   dotenv -e .env.development.local -- node drizzle/verify_carpetas.mjs check
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
if (mode !== 'apply' && mode !== 'check') { console.error('Uso: node drizzle/verify_carpetas.mjs <apply|check>'); process.exit(1) }
assertDbHostAllowed(url, 'migration')

const client = new pg.Client({ connectionString: url })
await client.connect()
let bad = 0
const ok = (cond, msg, extra = '') => { if (cond) console.log('  ✓ ' + msg); else { console.error('  ✗ ' + msg + (extra ? ' — ' + extra : '')); bad++ } }
const cols = async (table) => Object.fromEntries((await client.query(
  `SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1`, [table])).rows.map((r) => [r.column_name, r]))
const fk = async (name) => (await client.query(
  `SELECT confdeltype FROM pg_constraint WHERE conname = $1`, [name])).rows[0]?.confdeltype
try {
  console.log('Base:', new URL(url).host)
  const counts = async () => (await client.query(
    'SELECT (SELECT count(*)::int FROM assignments) AS a, (SELECT count(*)::int FROM videos) AS v, (SELECT count(*)::int FROM "user") AS u')).rows[0]
  const before = await counts()
  if (mode === 'apply') {
    await client.query(readFileSync(join(HERE, '0005_carpetas.sql'), 'utf8'))
    console.log('0005_carpetas.sql aplicado.')
  }
  const f = await cols('folders')
  ok(['id', 'owner_id', 'student_id', 'name', 'position', 'created_at'].every((c) => f[c]), 'tabla folders con sus columnas', Object.keys(f).join(','))
  ok(f.student_id?.is_nullable === 'YES' && f.name?.is_nullable === 'NO', 'folders.student_id NULL (biblioteca) y name NOT NULL')
  const fv = await cols('folder_videos')
  ok(['folder_id', 'video_id', 'added_at'].every((c) => fv[c]), 'tabla folder_videos con sus columnas', Object.keys(fv).join(','))
  const a = await cols('assignments')
  ok(a.folder_id?.data_type === 'uuid' && a.folder_id?.is_nullable === 'YES', 'assignments.folder_id uuid NULL')
  ok(await fk('assignments_folder_id_folders_id_fk') === 'n', 'borrar una carpeta deja el video sin carpeta (SET NULL)')
  const { rows: idx } = await client.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'folders_student_idx'`)
  ok(idx.length === 1, 'índice folders_student_idx')
  const after = await counts()
  ok(after.a === before.a && after.v === before.v && after.u === before.u, `asignaciones, videos y usuarios intactos (${after.a} / ${after.v} / ${after.u})`)
} finally {
  await client.end()
}
if (bad) { console.error(`\n${bad} chequeo(s) fallaron`); process.exit(1) }
console.log('\nTodo OK')
