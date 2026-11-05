// La cookie de sesión de Auth.js v5 (2026-11), para el login con usuario y contraseña:
// /api/login abre una sesión en la tabla `session` (la misma del login con Google) y deja
// esta cookie; desde ahí auth() la reconoce como cualquier otra. Puro. Tests:
// tests/lib/session-cookie.test.ts.
//   · Con https (Vercel) Auth.js usa el prefijo __Secure- y la marca Secure; en http
//     (local) va sin prefijo. Tiene que coincidir o auth() no la encuentra.
export function sessionCookieName(secure: boolean): string {
  return secure ? '__Secure-authjs.session-token' : 'authjs.session-token'
}

export function sessionCookieOptions(secure: boolean, expires: Date) {
  return { httpOnly: true, sameSite: 'lax' as const, path: '/', secure, expires }
}

// ¿El pedido llegó por https? (Vercel manda x-forwarded-proto.)
export function isSecureRequest(url: string, forwardedProto: string | null): boolean {
  if (forwardedProto) return forwardedProto.split(',')[0].trim() === 'https'
  return url.startsWith('https:')
}
