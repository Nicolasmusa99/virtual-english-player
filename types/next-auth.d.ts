import type { DefaultSession } from 'next-auth'
import type { Role } from '@/lib/db/schema'

// Fase 1 — exponer el rol (y teacherId) en la sesión y en el usuario del adapter.
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: Role | null
    } & DefaultSession['user']
  }

  interface User {
    role?: Role | null
    teacherId?: string | null
  }
}
