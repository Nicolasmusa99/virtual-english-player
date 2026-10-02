// El nombre de un video ("Comercial del auto"), el que ven profes y alumnos. El admin lo
// escribe al subirlo (mientras se transcribe) o lo cambia en "Mi biblioteca". Sin React
// ni DOM: tests/lib/video-name.test.ts.

export const VIDEO_NAME_MAX = 120
export const VIDEO_NAME_ERROR = 'Escribí el nombre del video (hasta 120 letras).'

// Las extensiones de video que se sacan del nombre ("Frozen.mp4" → "Frozen"). Solo estas:
// "Mr. Bean" o "Song vol.2" no pierden nada.
export const VIDEO_EXT_RE = /\.(mp4|m4v|mov|webm|mkv|avi|ogv|ogg|wmv|mpe?g)$/i

// Lo que escribió el admin, limpio: sin espacios de más ni caracteres de control.
// Vacío o más largo que VIDEO_NAME_MAX → null.
export function normalizeVideoName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.normalize('NFC').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s || s.length > VIDEO_NAME_MAX) return null
  return s
}

// El nombre que se propone al subir, a partir del archivo:
// 'comercial_del_auto.mp4' → 'Comercial del auto'; 'let-it-be.mp4' → 'Let it be';
// 'Spider-Man_trailer.mov' → 'Spider-Man trailer' (con espacios, los guiones quedan).
export function cleanVideoName(fileName: string): string {
  const raw = fileName.normalize('NFC').trim()
  let s = raw.replace(VIDEO_EXT_RE, '').replace(/_+/g, ' ')
  if (!/\s/.test(s)) s = s.replace(/[-.]+/g, ' ')
  s = s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) s = raw || 'Video'
  return (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, VIDEO_NAME_MAX).trim()
}
