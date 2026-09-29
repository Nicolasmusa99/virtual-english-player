// "Mi sala de Zoom" (G0) — aplicar y verificar drizzle/0003_zoom_url.sql.
//
// USO (base de PRUEBAS; la guarda anti-prod frena prod salvo ALLOW_PROD_DB=1 deliberado):
//   dotenv -e .env.development.local -- node drizzle/verify_zoom_url.mjs apply
//   dotenv -e .env.development.local -- node drizzle/verify_zoom_url.mjs check
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
if (mode !== 'apply' && mode !== 'check') { console.error('Uso: node drizzle/verify_zoom_url.mjs <apply|check>'); process.exit(1) }
assertDbHostAllowed(url, 'migration')

const client = new pg.Client({ connectionString: url })
await client.connect()
let bad = 0
try {
  console.log('Base:', new URL(url).host)
  const { rows: [before] } = await client.query('SELECT count(*)::int AS n FROM "user"')
  if (mode === 'apply') {
    await client.query(readFileSync(join(HERE, '0003_zoom_url.sql'), 'utf8'))
    console.log('0003_zoom_url.sql aplicado.')
  }
  const { rows } = await client.query(
    `SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'zoom_url'`)
  if (rows.length === 1 && rows[0].data_type === 'text' && rows[0].is_nullable === 'YES') console.log('  ✓ "user".zoom_url text NULL')
  else { console.error('  ✗ "user".zoom_url: ' + JSON.stringify(rows)); bad++ }
  const { rows: [after] } = await client.query('SELECT count(*)::int AS n FROM "user"')
  if (after.n === before.n) console.log(`  ✓ usuarios intactos (${after.n})`)
  else { console.error(`  ✗ cambió la cantidad de usuarios: ${before.n} → ${after.n}`); bad++ }
} finally {
  await client.end()
}
if (bad) { console.error(`\n${bad} chequeo(s) fallaron`); process.exit(1) }
console.log('\nTodo OK')
