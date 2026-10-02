// "Nombre y apellido" de una persona, como lo carga el admin o el profe al darla de alta
// (y al cambiarlo desde la pantalla del alumno). Puro. Tests: tests/lib/person-name.test.ts.
// Se guarda en `user.name`; entrar con Google NO lo pisa (el adapter solo engancha la
// cuenta a la fila ya creada).
export const NAME_MAX = 80

// Espacios de más afuera; null si no sirve (vacío, muy corto o largo, sin letras, o un mail).
export function normalizePersonName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (s.length < 2 || s.length > NAME_MAX) return null
  if (!/\p{L}/u.test(s)) return null
  if (/[<>@]/.test(s)) return null
  return s
}

export const NAME_ERROR = 'Escribí el nombre y apellido (de 2 a 80 letras).'
