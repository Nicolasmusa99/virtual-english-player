import { and, eq, isNotNull, ne, sql } from 'drizzle-orm'
import { normalizePersonName } from '@/lib/personName'
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { sessions, accounts, users } from '@/lib/db/schema'
import type { Role } from '@/lib/db/schema'

// Solo campos públicos — nunca exponemos tokens/sesiones ni datos internos.
// 2026-11: también la foto, el usuario (si entra con contraseña) y si tiene contraseña
// (nunca el hash).
const PUBLIC_COLS = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  teacherId: users.teacherId,
  image: users.image,
  username: users.username,
  hasPassword: sql<boolean>`(${users.passwordHash} is not null)`,
}

export type PublicUser = {
  id: string
  name: string | null
  email: string | null
  role: Role | null
  teacherId: string | null
  image: string | null
  username: string | null
  hasPassword: boolean
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

// Vista del alumno v2: el nombre de SU profe ("con Laura Sosa"). Solo el nombre, sin mail.
export async function getUserName(id: string): Promise<string | null> {
  const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, id))
  return row?.name ?? null
}

// "Mi sala de Zoom" (calendario, G0). Solo la lee/escribe el propio usuario (la ruta
// usa el id de la sesión) y la lee el calendario del alumno (la de SU profe).
export async function getZoomUrl(userId: string): Promise<string | null> {
  const [row] = await db.select({ zoomUrl: users.zoomUrl }).from(users).where(eq(users.id, userId))
  return row?.zoomUrl ?? null
}

export async function setZoomUrl(userId: string, zoomUrl: string | null): Promise<void> {
  await db.update(users).set({ zoomUrl }).where(eq(users.id, userId))
}

export async function insertUser(data: {
  name: string | null; email: string | null; role: Role; teacherId: string | null; username?: string | null; passwordHash?: string | null
}): Promise<PublicUser> {
  const { hasPassword: _omit, ...cols } = PUBLIC_COLS
  void _omit
  const [row] = await db.insert(users).values(data).returning(cols)
  return { ...row, hasPassword: !!data.passwordHash }
}

// "Cambiar nombre" (pantalla del alumno; profes y admins desde "Usuarios"). Quién puede lo
// decide la ruta (PATCH /api/users/[id]).
export async function setUserName(id: string, name: string): Promise<void> {
  await db.update(users).set({ name }).where(eq(users.id, id))
}

export async function listAllUsers(): Promise<PublicUser[]> {
  return db.select(PUBLIC_COLS).from(users)
}

// Solo los alumnos de ESTE profesor. El filtro va en la query (WHERE teacher_id = ...),
// no depende de ningún parámetro del cliente.
export async function listStudentsOf(teacherId: string): Promise<PublicUser[]> {
  return db.select(PUBLIC_COLS).from(users).where(eq(users.teacherId, teacherId))
}

// "Mi agenda" (G2): los alumnos de ESTE profe con su nombre (el de Google, si ya entró)
// para nombrarlos en la grilla. Mismo filtro server-side que listStudentsOf.
export async function listStudentNames(teacherId: string): Promise<{ id: string; name: string | null; email: string | null }[]> {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.teacherId, teacherId), eq(users.role, 'alumno')))
}

// Borrar una cuenta (solo el admin; ver DELETE /api/users/[id]). La base borra en cascada
// lo que cuelga del usuario (sesiones, cuentas de Google, asignaciones, carpetas, clases) y
// a los alumnos de un profe borrado les deja teacher_id en NULL. Sin la fila, el login
// (allowlist) ya no lo deja entrar.
export async function deleteUser(id: string): Promise<boolean> {
  const rows = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id })
  return rows.length > 0
}

// "Cambiar profe" de un alumno (solo el admin). null = sin profe.
export async function setUserTeacher(id: string, teacherId: string | null): Promise<void> {
  await db.update(users).set({ teacherId }).where(eq(users.id, id))
}

// ─── Cuentas con usuario y contraseña y fotos (2026-11) ──────────────────────

export async function getUserByUsername(username: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.username, username))
  return row ?? null
}

// Para el login: lo justo para comparar la contraseña y saber si puede entrar.
export async function getLoginByUsername(username: string): Promise<{ id: string; role: Role | null; passwordHash: string | null } | null> {
  const [row] = await db
    .select({ id: users.id, role: users.role, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.username, username))
  return row ?? null
}

// Abre una sesión en la tabla de Auth.js (la misma que usa el login con Google): con la
// estrategia `database`, auth() la reconoce sola por la cookie.
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60 // igual que Auth.js por defecto
export async function createSession(userId: string): Promise<{ sessionToken: string; expires: Date }> {
  const sessionToken = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_MAX_AGE_S * 1000)
  await db.insert(sessions).values({ sessionToken, userId, expires })
  return { sessionToken, expires }
}

// Cambiar la contraseña cierra las otras sesiones de esa persona (si alguien la sabía,
// deja de estar adentro). `keepToken` = la sesión desde la que se cambió (si es la suya).
export async function setPassword(userId: string, passwordHash: string, keepToken?: string | null): Promise<void> {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId))
  await db.delete(sessions).where(keepToken
    ? and(eq(sessions.userId, userId), ne(sessions.sessionToken, keepToken))
    : eq(sessions.userId, userId))
}

export type Profile = {
  id: string
  name: string | null
  email: string | null
  role: Role | null
  image: string | null
  imageCustom: boolean
  googleImage: string | null
  username: string | null
  hasPassword: boolean
  hasGoogle: boolean
}

export async function getProfile(id: string): Promise<Profile | null> {
  const [row] = await db
    .select({
      id: users.id, name: users.name, email: users.email, role: users.role, image: users.image,
      imageCustom: users.imageCustom, googleImage: users.googleImage, username: users.username,
      hasPassword: sql<boolean>`(${users.passwordHash} is not null)`,
    })
    .from(users)
    .where(eq(users.id, id))
  if (!row) return null
  const [g] = await db.select({ p: accounts.provider }).from(accounts)
    .where(and(eq(accounts.userId, id), eq(accounts.provider, 'google')))
  return { ...row, hasGoogle: !!g }
}

export async function getPasswordHash(id: string): Promise<string | null> {
  const [row] = await db.select({ h: users.passwordHash }).from(users).where(and(eq(users.id, id), isNotNull(users.passwordHash)))
  return row?.h ?? null
}

// Foto subida por la persona (o null = volver a la de Google). Devuelve la que había, por
// si hay que borrarla del Blob.
export async function setCustomImage(id: string, url: string | null): Promise<{ previous: string | null; image: string | null }> {
  const [row] = await db.select({ image: users.image, custom: users.imageCustom, google: users.googleImage }).from(users).where(eq(users.id, id))
  if (!row) return { previous: null, image: null }
  const image = url ?? row.google
  await db.update(users).set({ image, imageCustom: url !== null }).where(eq(users.id, id))
  return { previous: row.custom ? row.image : null, image }
}

// Al entrar con Google: se guarda su foto y, si la persona no subió una propia, se muestra
// esa. El nombre que cargó el admin NO se pisa (solo se completa si estaba vacío).
export async function syncGoogleProfile(email: string, picture: string | null, name: string | null): Promise<void> {
  const [row] = await db.select({ id: users.id, image: users.image, imageCustom: users.imageCustom, name: users.name })
    .from(users).where(eq(users.email, email))
  if (!row) return
  const image = row.imageCustom ? row.image : picture ?? row.image
  await db.update(users)
    .set({ googleImage: picture, image, ...(row.name ? {} : normalizePersonName(name) ? { name: normalizePersonName(name)! } : {}) })
    .where(eq(users.id, row.id))
}
