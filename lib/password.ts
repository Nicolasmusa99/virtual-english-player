// Contraseñas del lado del servidor (2026-11). Puro (solo node:crypto). Tests:
// tests/lib/password.test.ts. Las reglas (usuario, largo) están en lib/passwordRules.ts.
//   · La contraseña se guarda con scrypt y sal propia: "scrypt$<N>$<sal b64>$<hash b64>".
//   · Comparar es en tiempo constante (timingSafeEqual).
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const scrypt = (pw: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(pw, salt, keylen, opts, (e, k) => (e ? reject(e) : resolve(k))))

const N = 16384 // 2^14: ~50 ms por intento, sin pasarse de memoria en una función de Vercel
const KEYLEN = 64

export { PASSWORD_ERROR, PASSWORD_MAX, PASSWORD_MIN, USERNAME_ERROR, normalizeUsername, passwordProblem } from '@/lib/passwordRules'

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, KEYLEN, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (typeof password !== 'string' || !stored) return false
  const [algo, nStr, saltB64, keyB64] = stored.split('$')
  const n = Number(nStr)
  if (algo !== 'scrypt' || !Number.isInteger(n) || n < 1024 || !saltB64 || !keyB64) return false
  const want = Buffer.from(keyB64, 'base64')
  const got = await scrypt(password, Buffer.from(saltB64, 'base64'), want.length, { N: n, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return got.length === want.length && timingSafeEqual(got, want)
}

// Un hash cualquiera para comparar cuando el usuario no existe: así tarda lo mismo que uno
// real y no se puede adivinar qué usuarios hay midiendo el tiempo.
let dummy: Promise<string> | null = null
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(12).toString('hex')))
