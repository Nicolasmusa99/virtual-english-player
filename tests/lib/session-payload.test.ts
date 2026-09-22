// @vitest-environment node
// fix/session-payload — qué datos de la sesión llegan al navegador.
// Con estrategia `database`, Auth.js le pasa al callback `session` la fila de
// sesión COMPLETA + la fila de `user` COMPLETA; lo que devolvemos viaja tal cual a
// /api/auth/session y useSession(). Estos tests fijan la LISTA BLANCA.
import { describe, it, expect } from 'vitest'
import { toPublicSession } from '@/lib/sessionPayload'

// Lo que Auth.js realmente le pasa al callback (verificado en vivo): la fila del
// adapter con TODAS las columnas de `user`, más columnas que puedan aparecer después.
const ADAPTER_USER = {
  id: 'u-1',
  name: 'Ana',
  email: 'ana@mail.com',
  emailVerified: new Date('2026-09-01T00:00:00Z'),
  image: 'https://img/ana.png',
  role: 'profesor' as const,
  teacherId: 'p-9',
  passwordHash: '$2b$12$ESTE-HASH-NO-DEBE-SALIR-NUNCA',
  sessionToken: 'TOKEN-QUE-NO-DEBE-SALIR',
}
const EXPIRES = '2026-10-22T17:50:06.803Z'

describe('toPublicSession — lista blanca', () => {
  it('devuelve EXACTAMENTE {user:{id,name,email,image,role}, expires}', () => {
    const s = toPublicSession(ADAPTER_USER, EXPIRES)
    expect(s).toEqual({
      user: { id: 'u-1', name: 'Ana', email: 'ana@mail.com', image: 'https://img/ana.png', role: 'profesor' },
      expires: EXPIRES,
    })
    expect(Object.keys(s).sort()).toEqual(['expires', 'user'])
    expect(Object.keys(s.user).sort()).toEqual(['email', 'id', 'image', 'name', 'role'])
  })

  it('INVARIANTE: no sale el sessionToken (el HttpOnly de la cookie no se puede puentear)', () => {
    const json = JSON.stringify(toPublicSession(ADAPTER_USER, EXPIRES))
    expect(json).not.toContain('TOKEN-QUE-NO-DEBE-SALIR')
    expect(json).not.toMatch(/sessionToken/)
    expect(json).not.toMatch(/userId/)
  })

  it('INVARIANTE: una columna nueva de `user` (p. ej. un hash) NO se filtra sola', () => {
    const json = JSON.stringify(toPublicSession(ADAPTER_USER, EXPIRES))
    expect(json).not.toContain('ESTE-HASH-NO-DEBE-SALIR-NUNCA')
    expect(json).not.toMatch(/passwordHash|teacherId|emailVerified/)
  })

  it('rol NULL se preserva como null (el fail-closed de requireRole sigue funcionando)', () => {
    expect(toPublicSession({ ...ADAPTER_USER, role: null }, EXPIRES).user.role).toBeNull()
  })

  it('campos opcionales ausentes → null, nunca undefined (forma estable para el cliente)', () => {
    const s = toPublicSession({ id: 'u-2' }, EXPIRES)
    expect(s.user).toEqual({ id: 'u-2', name: null, email: null, image: null, role: null })
  })
})
