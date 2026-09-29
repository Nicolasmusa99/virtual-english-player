// Vista del alumno (E3) — funciones puras de presentación (lib/studentView.ts).
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} })) // el import de tipos arrastra lib/assignments

import {
  assignedAgo, displayVideoName, durationLabel, firstName, levelLabel, phraseAt,
  progressPct, SEEK_STEP, stepSeek, stepVolume, timeAtX, typeLabel, volumeBarsOn, VOLUME_BARS,
} from '@/lib/studentView'

describe('firstName', () => {
  it('primer nombre; sin nombre → parte local del email; nada → vacío', () => {
    expect(firstName('Martina López', 'm@x.com')).toBe('Martina')
    expect(firstName('  Juan  ', null)).toBe('Juan')
    expect(firstName(null, 'lucia.p@mail.com')).toBe('lucia.p')
    expect(firstName('', '')).toBe('')
  })
})

describe('displayVideoName', () => {
  it('saca la extensión, no los puntos del nombre', () => {
    expect(displayVideoName('Frozen (demo).mp4')).toBe('Frozen (demo)')
    expect(displayVideoName('clase.3.webm')).toBe('clase.3')
    expect(displayVideoName('Mr. Bean')).toBe('Mr. Bean')
    expect(displayVideoName('.mp4')).toBe('.mp4')
  })
})

describe('etiquetas', () => {
  it('tipo, nivel y duración en palabras; sin dato → null (no se muestra)', () => {
    expect(typeLabel('pelicula')).toBe('Película')
    expect(typeLabel('cancion')).toBe('Canción')
    expect(typeLabel(null)).toBeNull()
    expect(levelLabel('beginner')).toBe('Inicial')
    expect(levelLabel('medium')).toBe('Intermedio')
    expect(levelLabel('advance')).toBe('Avanzado')
    expect(levelLabel(null)).toBeNull()
    expect(durationLabel(20)).toBe('1 min')
    expect(durationLabel(185)).toBe('3 min')
    expect(durationLabel(null)).toBeNull()
    expect(durationLabel(0)).toBeNull()
  })
})

describe('assignedAgo (días de calendario)', () => {
  const now = new Date(2026, 8, 28, 10, 0) // 28/9/2026 10:00 local
  const d = (day: number, h = 12, month = 8) => new Date(2026, month, day, h)
  it('hoy / ayer / días / semanas / fecha', () => {
    expect(assignedAgo(d(28, 1), now)).toBe('Asignado hoy')
    expect(assignedAgo(d(27, 23), now)).toBe('Asignado ayer') // menos de 24 h, pero ayer
    expect(assignedAgo(d(25), now)).toBe('Asignado hace 3 días')
    expect(assignedAgo(d(21), now)).toBe('Asignado hace 1 semana')
    expect(assignedAgo(d(10), now)).toBe('Asignado hace 2 semanas')
    expect(assignedAgo(new Date(2026, 6, 1), now)).toBe('Asignado el 1/7/2026')
  })
  it('acepta el string ISO que llega de la API; inválido → vacío', () => {
    expect(assignedAgo(d(28).toISOString(), now)).toBe('Asignado hoy')
    expect(assignedAgo('no-es-fecha', now)).toBe('')
  })
})

describe('phraseAt (subtítulo del momento, con el delay del profe)', () => {
  const ph = [{ start: 1, end: 3, text: 'Hello' }, { start: 4, end: 6, text: 'World' }]
  it('encuentra la frase del momento', () => {
    expect(phraseAt(ph, 2, 0)).toBe('Hello')
    expect(phraseAt(ph, 5, 0)).toBe('World')
    expect(phraseAt(ph, 3.5, 0)).toBe('')
  })
  it('aplica el delay: con +1 s, "Hello" se ve entre 2 y 4', () => {
    expect(phraseAt(ph, 1.5, 1)).toBe('')
    expect(phraseAt(ph, 3.5, 1)).toBe('Hello')
  })
})

describe('volumen en pasos del 10%', () => {
  it('sube y baja de a 0,1 sin errores de coma flotante, y se queda en 0..1', () => {
    expect(stepVolume(0.7, 1)).toBe(0.8)
    expect(stepVolume(0.2, -1)).toBe(0.1)
    expect(stepVolume(1, 1)).toBe(1)
    expect(stepVolume(0, -1)).toBe(0)
    let v = 0
    for (let i = 0; i < 3; i++) v = stepVolume(v, 1)
    expect(v).toBe(0.3) // no 0.30000000000000004
  })
  it('barritas: 0 → ninguna, poquito → al menos una, 1 → todas', () => {
    expect(volumeBarsOn(0)).toBe(0)
    expect(volumeBarsOn(0.1)).toBe(1)
    expect(volumeBarsOn(0.5)).toBe(4)
    expect(volumeBarsOn(1)).toBe(VOLUME_BARS)
  })
})

describe('progressPct', () => {
  it('0..100 y sin romperse sin duración', () => {
    expect(progressPct(30, 120)).toBe(25)
    expect(progressPct(200, 120)).toBe(100)
    expect(progressPct(10, 0)).toBe(0)
    expect(progressPct(NaN, 100)).toBe(0)
  })
})

describe('timeAtX — tocar la barra de tiempo', () => {
  it('la posición del toque dentro de la barra → segundo del video', () => {
    expect(timeAtX(100, 100, 400, 200)).toBe(0)
    expect(timeAtX(300, 100, 400, 200)).toBe(100)
    expect(timeAtX(500, 100, 400, 200)).toBe(200)
  })
  it('fuera de la barra se clava en 0 / el final', () => {
    expect(timeAtX(40, 100, 400, 200)).toBe(0)
    expect(timeAtX(900, 100, 400, 200)).toBe(200)
  })
  it('sin duración o sin ancho → null (no salta)', () => {
    expect(timeAtX(300, 100, 400, 0)).toBeNull()
    expect(timeAtX(300, 100, 0, 200)).toBeNull()
    expect(timeAtX(NaN, 100, 400, 200)).toBeNull()
  })
})

describe('stepSeek — flechas sobre la barra', () => {
  it(`±${SEEK_STEP} s sin salirse del video`, () => {
    expect(stepSeek(10, 1, 60)).toBe(15)
    expect(stepSeek(10, -1, 60)).toBe(5)
    expect(stepSeek(2, -1, 60)).toBe(0)
    expect(stepSeek(58, 1, 60)).toBe(60)
    expect(stepSeek(10, 1, 0)).toBe(0)
  })
})
