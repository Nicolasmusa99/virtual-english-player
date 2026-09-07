import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'
import type { Role } from '@/lib/db/schema'

export type { Role }

/**
 * Guard de rol para route handlers. Fail-closed:
 *   - sin sesión               → { ok: false, status: 401 }
 *   - rol NULL o no permitido  → { ok: false, status: 403 }
 *   - rol permitido            → { ok: true, session }
 *
 * Uso:
 *   const gate = await requireRole('admin', 'profesor')
 *   if (!gate.ok) return NextResponse.json({ error: '...' }, { status: gate.status })
 *   const session = gate.session
 */
export async function requireRole(
  ...allowed: Role[]
): Promise<{ ok: true; session: Session } | { ok: false; status: 401 | 403 }> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, status: 401 }
  const role = session.user.role
  if (!role || !allowed.includes(role)) return { ok: false, status: 403 }
  return { ok: true, session }
}
