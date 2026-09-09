// Fase 1 — Seed de admins (dueños). Idempotente.
//   Corré:  npm run seed:admins
//   (carga .env.development.local + .env.local para tomar DATABASE_URL)
//
// Por cada email: si existe la fila `user` → UPDATE role='admin';
// si no existe → INSERT (email, role='admin') para poder auto-invitarse aunque nunca haya logueado.
// Al final imprime las filas resultantes para confirmar que quedaron como admin.
import { neon } from '@neondatabase/serverless'
import { assertDbHostAllowed } from '../lib/db/guard.mjs'

// Podés sobreescribir con SEED_ADMIN_EMAILS="a@x.com,b@y.com". Si no, usa esta lista.
const ADMIN_EMAILS = (process.env.SEED_ADMIN_EMAILS
  ? process.env.SEED_ADMIN_EMAILS.split(',')
  : [
      'nicolasmusa.nm@gmail.com',
      '<JULIO_EMAIL>', // ← reemplazar por el email real de Julio antes de correr
    ]
).map((e) => e.trim()).filter(Boolean)

const bad = ADMIN_EMAILS.filter((e) => e.includes('<') || !e.includes('@'))
if (bad.length) {
  console.error(`✗ Emails inválidos / sin reemplazar: ${bad.join(', ')}`)
  console.error('  Editá scripts/seed-admins.mjs o pasá SEED_ADMIN_EMAILS="a@x.com,b@y.com".')
  process.exit(1)
}

const url = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED
if (!url) {
  console.error('✗ Falta DATABASE_URL (o DATABASE_URL_UNPOOLED) en el entorno.')
  process.exit(1)
}

// Cinturón de seguridad: nunca seedear prod desde un entorno no-prod (ver lib/db/guard.mjs).
assertDbHostAllowed(url, 'seed')

const sql = neon(url)

for (const email of ADMIN_EMAILS) {
  const updated = await sql`update "user" set role = 'admin' where email = ${email} returning id`
  if (updated.length === 0) {
    await sql`insert into "user" (email, role) values (${email}, 'admin')`
    console.log(`+ insertado admin: ${email}`)
  } else {
    console.log(`= actualizado a admin: ${email}`)
  }
}

console.log('\n--- Filas admin resultantes ---')
for (const email of ADMIN_EMAILS) {
  const rows = await sql`select id, email, role from "user" where email = ${email}`
  console.log(rows[0] ?? `(sin fila para ${email})`)
}
