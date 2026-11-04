import { describe, it, expect } from 'vitest'
import { canSignUpWithGoogle } from '@/lib/signup'

describe('canSignUpWithGoogle', () => {
  it('solo con la intención de registrarse y un mail verificado por Google', () => {
    expect(canSignUpWithGoogle({ email: 'a@gmail.com', email_verified: true }, '1')).toBe(true)
    expect(canSignUpWithGoogle({ email: 'a@gmail.com', email_verified: true }, undefined)).toBe(false) // "Iniciar sesión" con un mail nuevo
    expect(canSignUpWithGoogle({ email: 'a@gmail.com', email_verified: false }, '1')).toBe(false)
    expect(canSignUpWithGoogle({ email: 'a@gmail.com' }, '1')).toBe(false)
    expect(canSignUpWithGoogle(null, '1')).toBe(false)
  })
})
