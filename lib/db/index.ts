import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '@/lib/db/schema'

// VE_DATABASE_URL: override manual por entorno. La integración Neon↔Vercel
// gestiona DATABASE_URL con el MISMO valor para Production y Preview; esta var
// (si existe) gana, y está definida SOLO en el scope Preview de Vercel apuntando
// a la branch de pruebas de Neon. Así los preview deploys nunca tocan la base
// real. En Production no existe → se usa DATABASE_URL como siempre.
const sql = neon(process.env.VE_DATABASE_URL || process.env.DATABASE_URL!)

export const db = drizzle(sql, { schema })
