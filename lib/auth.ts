import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema'
import { toPublicSession } from '@/lib/sessionPayload'
import { googlePicture } from '@/lib/avatar'
import { insertUser, syncGoogleProfile } from '@/lib/users'
import { cookies } from 'next/headers'
import { canSignUpWithGoogle, SIGNUP_INTENT_COOKIE, SIGNUP_ROLE } from '@/lib/signup'
import { normalizePersonName } from '@/lib/personName'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    // allowDangerousEmailAccountLinking: el registro es por invitación (admin/profesor crean
    // la fila `user` con email+rol SIN cuenta de Google). Para que el login de Google se
    // enganche a esa fila (por email) en vez de fallar con OAuthAccountNotLinked, hay que
    // permitir el linking por email. Es seguro acá: Google verifica emails y es el único provider.
    Google({ allowDangerousEmailAccountLinking: true }),
  ],
  session: { strategy: 'database' },
  // Errores (incl. AccessDenied del allowlist) vuelven a la bienvenida (no hay pantalla propia).
  pages: { signIn: '/', error: '/' },
  callbacks: {
    // Allowlist: entran los emails ya registrados CON rol asignado. Corre ANTES de que el
    // adapter cree el usuario → un email desconocido NO crea fila y no cae en ningún rol,
    // salvo "Crear cuenta con Google" (2026-11), que crea un alumno (ver lib/signup.ts).
    async signIn({ user, account, profile }) {
      if (!user.email) return false
      const [row] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.email, user.email))
      if (!row) {
        // 2026-11: "Crear cuenta con Google". Solo con la intención de registrarse (cookie
        // que deja ese botón) y un mail verificado por Google: se crea un ALUMNO sin profe
        // y el adapter engancha la cuenta de Google a esa fila (por mail).
        let intent: string | undefined
        try { intent = (await cookies()).get(SIGNUP_INTENT_COOKIE)?.value } catch { intent = undefined }
        if (account?.provider !== 'google' || !canSignUpWithGoogle(profile, intent)) return false
        try {
          await insertUser({ name: normalizePersonName(profile?.name), email: user.email.trim().toLowerCase(), role: SIGNUP_ROLE, teacherId: null })
        } catch (e) {
          if (!/duplicate key|unique/i.test((e as Error).message)) { console.error('[auth] no se pudo crear la cuenta:', (e as Error).message); return false }
        }
        try { (await cookies()).delete(SIGNUP_INTENT_COOKIE) } catch { /* vence sola */ }
      } else if (!row.role) return false // fila sin rol → sin acceso (fail-closed)
      // 2026-11: la foto de Google (y el nombre, si estaba vacío) pasan a su perfil. Si la
      // persona subió una foto propia, se respeta. Si falla, igual entra.
      if (account?.provider === 'google') {
        try { await syncGoogleProfile(user.email, googlePicture(profile?.picture ?? user.image), typeof profile?.name === 'string' ? profile.name : null) }
        catch (e) { console.error('[auth] no se pudo guardar la foto de Google:', (e as Error).message) }
      }
      return true
    },
    // Exponer el rol en la sesión (estrategia database → `user` es la fila del adapter).
    // Forma EXPLÍCITA (lista blanca): lo que devuelve este callback viaja al navegador
    // tal cual, y Auth.js le pasa la fila de `session` completa (con el sessionToken)
    // + la de `user` completa. Ver lib/sessionPayload.ts.
    async session({ session, user }) {
      return toPublicSession(user, session.expires)
    },
  },
})
