// Verificación de la migración de biblioteca compartida (read-only salvo snapshot).
//
// USO (siempre contra la branch DB de PREVIEW, nunca prod):
//   node drizzle/verify_biblioteca.mjs before   # ANTES de correr el .sql
//   <correr drizzle/0001_biblioteca_compartida.sql en la preview DB>
//   node drizzle/verify_biblioteca.mjs after    # DESPUÉS: valida invariantes
//
// Lee la conexión de DATABASE_URL_UNPOOLED (o DATABASE_URL). Correr con:
//   dotenv -e .env.preview.local -- node drizzle/verify_biblioteca.mjs before
//
// El modo `before` guarda un snapshot en drizzle/.verify-snapshot.json
// (conteo + mapa video_id→dueño esperado). El modo `after` lo compara.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const SNAP = join(dirname(fileURLToPath(import.meta.url)), '.verify-snapshot.json')
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!url) { console.error('Falta DATABASE_URL_UNPOOLED / DATABASE_URL'); process.exit(1) }

const mode = process.argv[2]
if (mode !== 'before' && mode !== 'after') {
  console.error('Uso: node drizzle/verify_biblioteca.mjs <before|after>'); process.exit(1)
}

const client = new pg.Client({ connectionString: url })
await client.connect()

function fail(msg) { console.error('  ✗ ' + msg); process.exitCode = 1 }
function ok(msg)   { console.log('  ✓ ' + msg) }

try {
  if (mode === 'before') {
    // Snapshot: conteo total + dueño esperado de cada sesión (join a videos).
    const { rows } = await client.query(`
      SELECT vs.video_id, v.user_id AS owner_id
        FROM video_sessions vs
        JOIN videos v ON v.id = vs.video_id
       ORDER BY vs.video_id`)
    const { rows: [cnt] } = await client.query('SELECT count(*)::int AS n FROM video_sessions')
    // Sesiones huérfanas (sin video): no deberían existir; las marcamos.
    const { rows: [orph] } = await client.query(`
      SELECT count(*)::int AS n FROM video_sessions vs
       WHERE NOT EXISTS (SELECT 1 FROM videos v WHERE v.id = vs.video_id)`)
    writeFileSync(SNAP, JSON.stringify({
      total: cnt.n,
      orphans: orph.n,
      expected: rows.map(r => [r.video_id, r.owner_id]),
    }, null, 2))
    console.log(`ANTES: ${cnt.n} sesiones (huérfanas sin video: ${orph.n}).`)
    console.log(`Snapshot guardado en ${SNAP}. Ahora corré el .sql y luego 'after'.`)
  } else {
    const snap = JSON.parse(readFileSync(SNAP, 'utf8'))
    console.log(`DESPUÉS: comparando contra snapshot de ${snap.total} sesiones.`)

    // 1) No se perdió ninguna sesión.
    const { rows: [cnt] } = await client.query('SELECT count(*)::int AS n FROM video_sessions')
    cnt.n === snap.total ? ok(`conteo intacto: ${cnt.n} == ${snap.total}`)
                         : fail(`conteo cambió: ${cnt.n} != ${snap.total}`)

    // 2) Toda sesión tiene user_id = dueño de su video (backfill correcto).
    const { rows: [bad] } = await client.query(`
      SELECT count(*)::int AS n FROM video_sessions vs
        JOIN videos v ON v.id = vs.video_id
       WHERE vs.user_id IS DISTINCT FROM v.user_id`)
    bad.n === 0 ? ok('todas las sesiones apuntan al dueño de su video')
                : fail(`${bad.n} sesiones con user_id != dueño`)

    // 3) Ninguna con user_id NULL.
    const { rows: [nul] } = await client.query(
      'SELECT count(*)::int AS n FROM video_sessions WHERE user_id IS NULL')
    nul.n === 0 ? ok('ninguna sesión con user_id NULL') : fail(`${nul.n} con user_id NULL`)

    // 4) PK compuesta (video_id, user_id).
    const { rows: pk } = await client.query(`
      SELECT a.attname AS col
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = 'video_sessions'::regclass AND i.indisprimary
       ORDER BY a.attname`)
    const cols = pk.map(r => r.col).sort().join(',')
    cols === 'user_id,video_id' ? ok('PK = (video_id, user_id)') : fail(`PK inesperada: (${cols})`)

    // 5) FK user_id -> user con ON DELETE CASCADE.
    const { rows: fk } = await client.query(`
      SELECT c.confdeltype FROM pg_constraint c
       WHERE c.conrelid = 'video_sessions'::regclass AND c.contype = 'f'
         AND c.confrelid = '"user"'::regclass`)
    fk.some(r => r.confdeltype === 'c') ? ok('FK user_id -> user ON DELETE CASCADE')
                                        : fail('falta FK user_id -> user ON DELETE CASCADE')

    // 6) Columnas nuevas en videos.
    const { rows: vcols } = await client.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'videos'
         AND column_name IN ('shared_type','shared_level','published_at')`)
    vcols.length === 3 ? ok('videos tiene shared_type / shared_level / published_at')
                       : fail(`faltan columnas en videos (encontradas: ${vcols.length}/3)`)

    console.log(process.exitCode ? '\nRESULTADO: FALLÓ — revisar arriba.' : '\nRESULTADO: OK ✅')
  }
} finally {
  await client.end()
}
