// Reglas de mail y contraseña (2026-11). Puro y sin node:crypto: lo usan el servidor
// (lib/password.ts, rutas) y las pantallas. Tests: tests/lib/password.test.ts.

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 200
export const PASSWORD_ERROR = `La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres.`

// El mail como se guarda y se busca (minúsculas, sin espacios afuera). null si no sirve.
export const EMAIL_ERROR = 'Escribí un mail válido.'
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null
}

// null si la contraseña sirve; si no, qué falta.
export function passwordProblem(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < PASSWORD_MIN || raw.trim().length === 0) return PASSWORD_ERROR
  if (raw.length > PASSWORD_MAX) return `La contraseña puede tener hasta ${PASSWORD_MAX} caracteres.`
  return null
}

// Una contraseña para proponer: fácil de dictar (sin 0/O ni 1/l/I). Usa el azar seguro
// del navegador o de Node (los dos tienen crypto.getRandomValues).
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function makePassword(length = 10): string {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}
