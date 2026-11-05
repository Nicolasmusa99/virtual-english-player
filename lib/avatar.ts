// Fotos de perfil (2026-11). Puro. Tests: tests/lib/avatar.test.ts.
//   · La foto que sube cada uno va a Vercel Blob en avatars/<su id>/…; el servidor solo
//     acepta guardar una URL de nuestro Blob y dentro de SU carpeta.
//   · La de Google la manda Google al entrar (googleusercontent.com).

export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const AVATAR_SIZE = 320 // lado del cuadrado que sube el navegador (ya recortado)

export const avatarPrefix = (userId: string) => `avatars/${userId}/`

// ¿Es una foto subida por ESTA persona a nuestro Blob?
export function isOwnAvatarUrl(raw: unknown, userId: string): raw is string {
  if (typeof raw !== 'string' || raw.length > 600) return false
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'https:') return false
  if (!/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i.test(u.hostname)) return false
  if (u.search || u.hash) return false
  return u.pathname.startsWith('/' + avatarPrefix(userId)) && /\.(jpe?g|png|webp)$/i.test(u.pathname)
}

// ¿Es un pathname válido para pedir el token de subida? (avatars/<id>/algo.jpg)
export function isOwnAvatarPath(pathname: unknown, userId: string): boolean {
  if (typeof pathname !== 'string' || pathname.length > 200) return false
  if (!pathname.startsWith(avatarPrefix(userId))) return false
  const rest = pathname.slice(avatarPrefix(userId).length)
  return /^[a-zA-Z0-9_-]{1,60}\.(jpe?g|png|webp)$/.test(rest)
}

// La foto de Google que llega al entrar: solo https de googleusercontent.com.
export function googlePicture(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 600) return null
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && /(^|\.)googleusercontent\.com$/i.test(u.hostname) ? raw : null
  } catch { return null }
}

// Qué foto mostrar y qué guardar después de entrar con Google.
// Si la persona subió una propia, se respeta; si no, va la de Google.
export function afterGoogleSignIn(current: { image: string | null; imageCustom: boolean }, picture: string | null) {
  return {
    googleImage: picture,
    image: current.imageCustom ? current.image : picture ?? current.image,
  }
}
