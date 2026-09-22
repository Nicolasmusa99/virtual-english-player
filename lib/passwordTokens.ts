// ─── Tokens de los links de contraseña (F2) ──────────────────────────────────
// Un token = un permiso de un solo uso para PONER una contraseña. NO es un login:
// consumirlo no crea sesión (por eso no reusamos el Email provider de Auth.js).
//
// Reglas:
//   · El token CRUDO no se guarda nunca. En la DB va sha256(token). Un volcado de
//     la base no da links usables. Hash rápido (no bcrypt) porque son 256 bits
//     aleatorios: no hay diccionario que los adivine, y así el lookup usa el índice.
//   · Un solo uso, garantizado por un UPDATE atómico condicionado a used_at IS NULL:
//     dos requests simultáneos con el mismo token → solo uno gana.
//   · Vencimiento en la fila y en el WHERE: un token vencido no se puede consumir.
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { passwordTokens } from '@/lib/db/schema'
import type { PasswordTokenPurpose } from '@/lib/db/schema'
import { INVITE_TTL_DAYS, RESET_TTL_MINUTES } from '@/lib/emailTemplates'

// 32 bytes = 256 bits de entropía, de crypto.randomBytes (NUNCA Math.random ni
// UUID v4). En base64url son 43 caracteres seguros para una URL.
const TOKEN_BYTES = 32

export type TokenRef = { userId: string; purpose: PasswordTokenPurpose }

/** sha256 hex del token. Lo único que viaja a la base. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

/** Vencimiento según el propósito. Los plazos viven en lib/emailTemplates.ts,
 *  que es lo que le promete al usuario: así no pueden quedar desfasados. */
export function expiryFor(purpose: PasswordTokenPurpose, now: Date = new Date()): Date {
  const ms = purpose === 'invite'
    ? INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
    : RESET_TTL_MINUTES * 60 * 1000
  return new Date(now.getTime() + ms)
}

/** Quema los tokens vivos de un usuario. Sin `purpose` quema todos. Devuelve cuántos. */
export async function invalidateTokens(userId: string, purpose?: PasswordTokenPurpose): Promise<number> {
  const rows = await db
    .update(passwordTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordTokens.userId, userId),
        isNull(passwordTokens.usedAt),
        ...(purpose ? [eq(passwordTokens.purpose, purpose)] : [])
      )
    )
    .returning({ id: passwordTokens.id })
  return rows.length
}

/** Borra los tokens ya usados o vencidos de un usuario. Limpieza perezosa: se
 *  llama al emitir uno nuevo, así la tabla no crece sin límite y no hace falta cron. */
export async function pruneTokens(userId: string): Promise<void> {
  await db
    .delete(passwordTokens)
    .where(
      and(
        eq(passwordTokens.userId, userId),
        or(isNotNull(passwordTokens.usedAt), lt(passwordTokens.expiresAt, new Date()))
      )
    )
}

/**
 * Emite un token nuevo y devuelve el CRUDO (única vez que existe fuera del mail).
 * Antes limpia lo viejo y quema los vivos del mismo propósito: un solo link
 * vigente por propósito → reenviar una invitación mata la anterior, y pedir un
 * reset nuevo mata el anterior.
 */
export async function createPasswordToken(
  userId: string,
  purpose: PasswordTokenPurpose
): Promise<{ raw: string; expiresAt: Date }> {
  await pruneTokens(userId)
  await invalidateTokens(userId, purpose)

  const raw = randomBytes(TOKEN_BYTES).toString('base64url')
  const expiresAt = expiryFor(purpose)
  await db.insert(passwordTokens).values({ userId, tokenHash: hashToken(raw), purpose, expiresAt })
  return { raw, expiresAt }
}

/**
 * Mira si un token sirve, SIN gastarlo. Se usa para validar antes de pedirle la
 * contraseña a la persona: si la contraseña no cumple la política, el link tiene
 * que seguir vivo para que pueda reintentar.
 */
export async function peekPasswordToken(raw: unknown): Promise<TokenRef | null> {
  if (typeof raw !== 'string' || raw.length === 0) return null
  const [row] = await db
    .select({ userId: passwordTokens.userId, purpose: passwordTokens.purpose })
    .from(passwordTokens)
    .where(
      and(
        eq(passwordTokens.tokenHash, hashToken(raw)),
        isNull(passwordTokens.usedAt),
        gt(passwordTokens.expiresAt, new Date())
      )
    )
  return row ?? null
}

/**
 * Gasta el token. UPDATE atómico: la condición `used_at IS NULL` va en el WHERE,
 * así que si dos requests llegan juntos, la base decide y solo uno recibe fila.
 * Devuelve null si no existe, ya se usó o venció — el que llama NO debe distinguir
 * esos casos hacia afuera.
 */
export async function consumePasswordToken(raw: unknown): Promise<TokenRef | null> {
  if (typeof raw !== 'string' || raw.length === 0) return null
  const rows = await db
    .update(passwordTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordTokens.tokenHash, hashToken(raw)),
        isNull(passwordTokens.usedAt),
        gt(passwordTokens.expiresAt, new Date())
      )
    )
    .returning({ userId: passwordTokens.userId, purpose: passwordTokens.purpose })
  return rows[0] ?? null
}
