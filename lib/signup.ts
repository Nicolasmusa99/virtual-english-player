// Crear cuenta desde la bienvenida (2026-11). Puro. Tests: tests/lib/signup.test.ts.
//   · Quien se registra entra como ALUMNO, sin profe (el admin le asigna uno después, desde
//     el filtro "Sin profe" de Usuarios). Nunca se elige el rol desde afuera.
//   · Con Google: el botón "Crear cuenta con Google" deja una cookie de intención; el login
//     de Google con un mail que no existe solo crea la cuenta si esa cookie está. Así
//     "Iniciar sesión con Google" con una cuenta equivocada no crea cuentas basura.
export const SIGNUP_INTENT_COOKIE = 've-signup'
export const SIGNUP_INTENT_MAX_AGE_S = 10 * 60
export const SIGNUP_ROLE = 'alumno' as const

// ¿Se puede crear la cuenta de Google? Mail verificado por Google y con intención de registro.
export function canSignUpWithGoogle(profile: { email?: unknown; email_verified?: unknown } | null | undefined, intent: string | undefined): boolean {
  return intent === '1' && typeof profile?.email === 'string' && profile.email_verified === true
}
