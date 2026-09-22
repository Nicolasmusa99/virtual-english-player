// ─── Qué datos de la sesión llegan al navegador ──────────────────────────────
//
// Con la estrategia `database`, Auth.js le pasa al callback `session` la fila de
// `session` COMPLETA (incluido el sessionToken) + la fila de `user` COMPLETA, y lo
// que ese callback devuelve viaja tal cual al navegador (/api/auth/session y
// useSession()). Devolver el objeto recibido filtraba:
//   · el sessionToken → le quita efecto al HttpOnly de la cookie: un XSS podría
//     leerlo con fetch('/api/auth/session') y llevarse la sesión a otra máquina;
//   · cualquier columna que se le agregue a `user` en el futuro.
//
// Por eso es una LISTA BLANCA: solo sale lo que la app usa (id y role; name, email
// e image son los campos estándar de Auth.js). Un campo nuevo en `user` NO se filtra
// solo — hay que agregarlo acá a propósito.
import type { Session } from 'next-auth'
import type { Role } from '@/lib/db/schema'

type SessionUserSource = {
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
  role?: Role | null
}

export function toPublicSession(user: SessionUserSource, expires: Session['expires']): Session {
  return {
    user: {
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
      role: user.role ?? null,
    },
    expires,
  }
}
