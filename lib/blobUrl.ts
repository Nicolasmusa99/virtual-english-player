// ¿Es una URL de NUESTRO almacenamiento (Vercel Blob público)? Puro. Tests: tests/lib/blob-url.test.ts.
// La usan /api/transcribe (el servidor baja esa URL: sin este chequeo se le podría hacer
// pedir cualquier dirección) y PATCH /api/videos/[id] (esa URL termina siendo el `src` del
// video que ven profes y alumnos).
export function isVercelBlobUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 1000) return false
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false
  return /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i.test(u.hostname)
}
