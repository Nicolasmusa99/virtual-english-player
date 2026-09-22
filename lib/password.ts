// ─── Contraseñas: hash, verificación y política (F0) ─────────────────────────
// Único lugar del proyecto que toca contraseñas en claro. Reglas de oro:
//   · La contraseña en claro NUNCA se guarda, se loguea ni se devuelve.
//   · No es recuperable: solo reemplazable vía link por mail (F2/F4).
//   · La validación de política es SIEMPRE server-side; la del cliente es cosmética.
import bcrypt from 'bcryptjs'

// Política (NIST 800-63B): largo mínimo razonable y CERO reglas de composición.
// Exigir "una mayúscula y un símbolo" empuja a la gente a `Password1!`, que es peor
// que una frase larga. Lo que sí filtramos son las contraseñas obvias (ver COMMON).
export const PASSWORD_MIN_CHARS = 10
export const PASSWORD_MAX_CHARS = 64

// Cost 12 ≈ 400ms por verificación: suficientemente lento para frenar fuerza bruta
// offline, suficientemente rápido para un login serverless.
export const BCRYPT_COST = 12

// ⚠️ bcrypt TRUNCA silenciosamente a 72 bytes: `contraseña_muy_larga_A` y
// `contraseña_muy_larga_B` darían el mismo hash si comparten los primeros 72 bytes.
// Por eso validamos BYTES además de caracteres (un emoji son 4 bytes: 64 emojis = 256).
const BCRYPT_MAX_BYTES = 72

// Hash bcrypt (cost 12) de una cadena aleatoria que nadie conoce ni necesita.
// Se usa para gastar el MISMO tiempo cuando el usuario no existe o no tiene
// contraseña, y que el tiempo de respuesta no delate qué cuentas existen.
// Es público a propósito: no protege nada, solo iguala la duración del compare.
export const DUMMY_HASH = '$2b$12$8XiiFntpGxTeOv6VsPSO2OX7yD5FAki0xB8.tyk5JszaFhIHUPaAW'

// Marcas propias: que la contraseña no sea "virtualenglish2026".
const BRAND_TERMS = ['virtualenglish', 'virtual english', 'virtualingles', 'virtual ingles']

// Las sospechosas de siempre, ya filtradas a >= PASSWORD_MIN_CHARS (las cortas ya
// las frena el largo mínimo). No pretende ser exhaustiva: corta lo obvio sin
// arrastrar un diccionario de 100k entradas al bundle.
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd',
  'contrasena', 'contraseña', 'contrasena123', 'micontrasena', 'contrasenia',
  'qwertyuiop', 'qwerty123', 'qwerty1234', 'qwertyui', 'asdfghjkl', 'zxcvbnm',
  '1234567890', '123456789', '12345678910', '1234512345', '0987654321',
  'iloveyou', 'iloveyou1', 'iloveyou123', 'teamo123', 'teamomucho',
  'letmein123', 'letmeinnow', 'welcome123', 'welcome1234', 'bienvenido',
  'administrator', 'administrador', 'admin12345', 'administra',
  'superman1', 'batman123', 'pokemon123', 'football123', 'basketball',
  'princess1', 'princesa123', 'sunshine1', 'chocolate', 'chocolate1',
  'monkey1234', 'dragon1234', 'trustno1234', 'whatever123', 'freedom123',
  'abcdefghij', 'abcd1234', 'abcd123456', 'aaaaaaaaaa', 'xxxxxxxxxx',
  'starwars123', 'liverpool1', 'bocajuniors', 'riverplate', 'argentina',
  'argentina1', 'buenosaires', 'mipassword', 'micontraseña', 'estaesmiclave',
  'englishclass', 'ingles1234', 'profesor123', 'alumno1234', 'estudiante',
])

export type PasswordPolicyResult = { ok: true } | { ok: false; error: string }

/** Quita dígitos/signos del final: "password123!" → "password". Para que cambiar
 *  `qwertyuiop` por `qwertyuiop1` no esquive la lista de comunes. */
function stripTrailingNoise(s: string): string {
  return s.replace(/[\d\W_]+$/u, '')
}

/**
 * Valida la política de contraseñas. Devuelve un mensaje en castellano listo para
 * mostrar — NUNCA incluye la contraseña en el error.
 *
 * @param password  lo que mandó el cliente (tipo `unknown` a propósito: puede ser
 *                  cualquier cosa; no confiamos en el body).
 * @param opts.email  email del usuario, para prohibir que la contraseña lo contenga.
 */
export function validatePassword(
  password: unknown,
  opts: { email?: string | null } = {}
): PasswordPolicyResult {
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: 'La contraseña es obligatoria.' }
  }
  // Ojo: NO se hace trim. Los espacios son caracteres válidos (una frase de paso
  // con espacios es buenísima) y recortarlos cambiaría lo que la persona escribió.
  if (password.length < PASSWORD_MIN_CHARS) {
    return { ok: false, error: `La contraseña debe tener al menos ${PASSWORD_MIN_CHARS} caracteres.` }
  }
  if (password.length > PASSWORD_MAX_CHARS) {
    return { ok: false, error: `La contraseña no puede superar los ${PASSWORD_MAX_CHARS} caracteres.` }
  }
  if (new TextEncoder().encode(password).length > BCRYPT_MAX_BYTES) {
    return { ok: false, error: 'La contraseña es demasiado larga.' }
  }

  const lower = password.toLowerCase()
  const base = stripTrailingNoise(lower)
  if (COMMON.has(lower) || (base.length >= 4 && COMMON.has(base))) {
    return { ok: false, error: 'Esa contraseña es demasiado común. Elegí otra.' }
  }
  if (BRAND_TERMS.some((t) => lower.includes(t))) {
    return { ok: false, error: 'La contraseña no puede contener el nombre del sitio.' }
  }

  const local = (opts.email ?? '').split('@')[0]?.trim().toLowerCase() ?? ''
  if (local.length >= 3 && lower.includes(local)) {
    return { ok: false, error: 'La contraseña no puede contener tu email.' }
  }

  return { ok: true }
}

/**
 * Hashea una contraseña con bcrypt cost 12 (salt incluido en el resultado).
 *
 * Revalida la política y TIRA si no la cumple: fail-closed. Aunque una ruta futura
 * se olvide de validar, es imposible que termine guardándose una contraseña débil.
 */
export async function hashPassword(password: string): Promise<string> {
  const check = validatePassword(password)
  if (!check.ok) throw new Error(`[password] contraseña inválida: ${check.error}`)
  return bcrypt.hash(password, BCRYPT_COST)
}

/**
 * Verifica una contraseña contra un hash guardado.
 *
 * Si el usuario no existe o no tiene contraseña, el llamador pasa `null` y esta
 * función igual gasta un compare contra DUMMY_HASH antes de devolver false, para
 * que el tiempo de respuesta no revele si la cuenta existe (ver 4.4 del plan).
 */
export async function verifyPassword(
  password: unknown,
  hash: string | null | undefined
): Promise<boolean> {
  const candidate = typeof password === 'string' ? password : ''
  if (!hash) {
    await bcrypt.compare(candidate, DUMMY_HASH)
    return false
  }
  try {
    return await bcrypt.compare(candidate, hash)
  } catch {
    // Hash corrupto en la DB (no es un caso que pueda provocar un atacante):
    // negamos el acceso en vez de propagar un 500.
    return false
  }
}
