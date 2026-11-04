// Reglas de usuario y contraseña (2026-11). Puro y sin node:crypto: lo usan el servidor
// (lib/password.ts, rutas) y las pantallas. Tests: tests/lib/password.test.ts.

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 200
export const PASSWORD_ERROR = `La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres.`

export const USERNAME_MIN = 3
export const USERNAME_MAX = 30
export const USERNAME_ERROR = 'El usuario va con letras, números, punto, guion o guion bajo (de 3 a 30), sin espacios.'

// El usuario como se guarda (minúsculas, sin espacios afuera). null si no sirve.
export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  if (s.length < USERNAME_MIN || s.length > USERNAME_MAX) return null
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(s)) return null
  return s
}

// null si la contraseña sirve; si no, qué falta.
export function passwordProblem(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < PASSWORD_MIN || raw.trim().length === 0) return PASSWORD_ERROR
  if (raw.length > PASSWORD_MAX) return `La contraseña puede tener hasta ${PASSWORD_MAX} caracteres.`
  return null
}

// Un usuario a partir del nombre: "Martina Pérez" → "martina.perez".
export function suggestUsername(name: string): string {
  const words = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const base = words.length === 1 ? words[0] : `${words[0]}.${words[words.length - 1]}`
  return base.slice(0, USERNAME_MAX)
}

// Una contraseña para proponer: fácil de dictar (sin 0/O ni 1/l/I). Usa el azar seguro
// del navegador o de Node (los dos tienen crypto.getRandomValues).
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function makePassword(length = 10): string {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}
