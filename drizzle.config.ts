import { defineConfig } from 'drizzle-kit'
import { assertDbHostAllowed } from './lib/db/guard.mjs'

// Cinturón de seguridad: db:push/migraciones nunca contra prod desde un entorno
// no-prod (ver lib/db/guard.mjs). Corre al invocar drizzle-kit (carga del config).
assertDbHostAllowed(process.env.DATABASE_URL_UNPOOLED, 'migration')

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
})
