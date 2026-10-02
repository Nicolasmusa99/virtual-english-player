// El nombre de un video (vista del alumno v2): el que se propone al subir y el que escribe el admin.
import { describe, it, expect } from 'vitest'
import { cleanVideoName, normalizeVideoName, VIDEO_NAME_MAX } from '@/lib/videoName'

describe('cleanVideoName — el nombre que se propone a partir del archivo', () => {
  it('saca la extensión de video, cambia los guiones bajos por espacios y pone mayúscula', () => {
    expect(cleanVideoName('comercial_del_auto_FINAL.mp4')).toBe('Comercial del auto FINAL')
    expect(cleanVideoName('Frozen (demo).MOV')).toBe('Frozen (demo)')
    expect(cleanVideoName('  let__it   be.webm ')).toBe('Let it be')
  })

  it('sin espacios, los guiones y puntos también separan; con espacios, quedan', () => {
    expect(cleanVideoName('let-it-be.mp4')).toBe('Let it be')
    expect(cleanVideoName('clase.3.final.mkv')).toBe('Clase 3 final')
    expect(cleanVideoName('Spider-Man_trailer.mov')).toBe('Spider-Man trailer')
    expect(cleanVideoName('Mr. Bean en la playa.mp4')).toBe('Mr. Bean en la playa')
  })

  it('solo saca extensiones de video; un nombre que queda vacío vuelve al del archivo', () => {
    expect(cleanVideoName('Song vol 2.avi')).toBe('Song vol 2')
    expect(cleanVideoName('.mp4')).toBe('.mp4')
    expect(cleanVideoName('___.mp4')).toBe('___.mp4')
  })

  it('nunca pasa del largo máximo', () => {
    expect(cleanVideoName('a'.repeat(300) + '.mp4')).toHaveLength(VIDEO_NAME_MAX)
  })
})

describe('normalizeVideoName — lo que escribe el admin', () => {
  it('limpia espacios y caracteres de control', () => {
    expect(normalizeVideoName('  Comercial   del auto ')).toBe('Comercial del auto')
    expect(normalizeVideoName('Let\tIt\nBe')).toBe('Let It Be')
  })

  it('vacío, muy largo o que no es texto → null', () => {
    for (const x of ['', '   ', 'a'.repeat(VIDEO_NAME_MAX + 1), null, undefined, 3, {}]) expect(normalizeVideoName(x)).toBeNull()
    expect(normalizeVideoName('a'.repeat(VIDEO_NAME_MAX))).toHaveLength(VIDEO_NAME_MAX)
  })
})
