import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sessions, userCredentials, users } from '@/lib/db/schema'
import type { Role } from '@/lib/db/schema'

// Solo campos públicos — nunca exponemos tokens/sesiones ni datos internos.
// ⚠️ INVARIANTE: ningún dato de credenciales va acá (el hash ni siquiera vive en
// `user`: está en `user_credentials`). Se exporta para que un test pueda afirmarlo:
// ver tests/lib/password-schema.test.ts.
export const PUBLIC_COLS = {
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

// Para el guard de asignaciones: necesita el teacherId además del rol, para
// verificar server-side que un alumno es de ESTE profe. Nunca se confía en el body.
export async function getStudentById(id: string): Promise<{ id: string; role: Role | null; teacherId: string | null } | null> {
  const [row] = await db
    .select({ id: users.id, role: users.role, teacherId: users.teacherId })
    .from(users)
    .where(eq(users.id, id))
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

// ─── Login con contraseña (F2) ───────────────────────────────────────────────

// Igual que getStudentById pero con el EMAIL: lo necesita el flujo de invitación
// (a dónde mandar el mail) y el de poner contraseña (para la política).
export async function getPublicUserById(id: string): Promise<PublicUser | null> {
  const [row] = await db.select(PUBLIC_COLS).from(users).where(eq(users.id, id))
  return row ?? null
}

/**
 * Guarda el hash de la contraseña en `user_credentials` (NUNCA en `user`: ver el
 * comentario de la tabla en schema.ts). Marca `emailVerified` a la vez y a propósito:
 * para llegar acá la persona tuvo que abrir un link que le llegó a SU casilla, o sea
 * que el mail quedó probado en el mismo acto.
 * `db.batch` = una sola transacción: o se guardan las dos cosas, o ninguna.
 */
export async function setUserPassword(userId: string, passwordHash: string): Promise<void> {
  const now = new Date()
  await db.batch([
    db
      .insert(userCredentials)
      .values({ userId, passwordHash, updatedAt: now })
      .onConflictDoUpdate({ target: userCredentials.userId, set: { passwordHash, updatedAt: now } }),
    db.update(users).set({ emailVerified: now }).where(eq(users.id, userId)),
  ])
}

/**
 * Borra las sesiones vivas de un usuario. Se llama al fijar una contraseña nueva:
 * si alguien había entrado con la contraseña vieja, un reset lo echa. Es lo que
 * hace que "olvidé mi contraseña" sirva de verdad para recuperar una cuenta.
 */
export async function deleteAuthSessions(userId: string): Promise<number> {
  const rows = await db
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ token: sessions.sessionToken })
  return rows.length
}

// ─── Login con contraseña (F3) ───────────────────────────────────────────────

/**
 * ÚNICA función del proyecto que lee `user_credentials.password_hash`. Solo la usa
 * la ruta de login, y el hash nunca sale de ahí (se compara y se descarta).
 * LEFT JOIN: un usuario sin fila de credenciales (solo Google) vuelve con
 * passwordHash null, y la ruta lo trata igual que una contraseña incorrecta.
 * El email se compara en minúsculas: las altas lo normalizan, pero así un email
 * sembrado con mayúsculas no deja a nadie afuera.
 */
export async function getUserForLogin(
  normalizedEmail: string
): Promise<{ id: string; role: Role | null; passwordHash: string | null } | null> {
  const [row] = await db
    .select({ id: users.id, role: users.role, passwordHash: userCredentials.passwordHash })
    .from(users)
    .leftJoin(userCredentials, eq(userCredentials.userId, users.id))
    .where(sql`lower(${users.email}) = ${normalizedEmail}`)
  return row ?? null
}
