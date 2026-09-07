import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import type { Role } from '@/lib/db/schema'

// Solo campos públicos — nunca exponemos tokens/sesiones ni datos internos.
const PUBLIC_COLS = {
  id: users.id,
  email: users.email,
  role: users.role,
  teacherId: users.teacherId,
}

export type PublicUser = {
  id: string
  email: string | null
  role: Role | null
  teacherId: string | null
}

export async function getUserByEmail(email: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  return row ?? null
}

export async function getUserById(id: string) {
  const [row] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id))
  return row ?? null
}

export async function insertUser(data: { email: string; role: Role; teacherId: string | null }): Promise<PublicUser> {
  const [row] = await db.insert(users).values(data).returning(PUBLIC_COLS)
  return row
}

export async function listAllUsers(): Promise<PublicUser[]> {
  return db.select(PUBLIC_COLS).from(users)
}

// Solo los alumnos de ESTE profesor. El filtro va en la query (WHERE teacher_id = ...),
// no depende de ningún parámetro del cliente.
export async function listStudentsOf(teacherId: string): Promise<PublicUser[]> {
  return db.select(PUBLIC_COLS).from(users).where(eq(users.teacherId, teacherId))
}
