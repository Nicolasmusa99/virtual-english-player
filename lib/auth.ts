import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema'

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
    // Allowlist: SOLO entran emails ya registrados CON rol asignado. Corre ANTES de que el
    // adapter cree el usuario → un email desconocido NO crea fila y no cae en ningún rol.
    async signIn({ user }) {
      if (!user.email) return false
      const [row] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.email, user.email))
      return !!row?.role // deny si no existe fila o si la fila no tiene rol (fail-closed)
    },
    // Exponer el rol en la sesión (estrategia database → `user` es la fila del adapter).
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
        session.user.role = user.role ?? null
      }
      return session
    },
  },
})
