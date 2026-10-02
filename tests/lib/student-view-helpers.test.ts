// Vista del alumno (E3) — funciones puras de presentación (lib/studentView.ts).
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} })) // el import de tipos arrastra lib/assignments

import {
  assignedAgo, displayVideoName, durationLabel, firstName, isNewAssignment, lastStartedIndex, levelLabel, newestFirst, phraseAt,
  phraseEndAt, phraseIndexAt, phraseStartAt, phraseTarget,
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

  it('solo extensiones de video: un nombre escrito por el admin queda igual', () => {
    expect(displayVideoName('Song vol.2')).toBe('Song vol.2')
    expect(displayVideoName('Comercial del auto')).toBe('Comercial del auto')
    expect(displayVideoName('Let It Be.MKV')).toBe('Let It Be')
  })
})

describe('player para practicar: de frase en frase', () => {
  const P = [{ start: 1, end: 3, text: 'a' }, { start: 4, end: 6, text: 'b' }, { start: 8, end: 9, text: 'c' }]
  it('phraseIndexAt: la que suena (con el delay), -1 en un silencio', () => {
    expect(phraseIndexAt(P, 2, 0)).toBe(0)
    expect(phraseIndexAt(P, 3.5, 0)).toBe(-1)
    expect(phraseIndexAt(P, 3.5, 1)).toBe(0)
    expect(phraseIndexAt(P, 8.5, 0)).toBe(2)
  })
  it('lastStartedIndex: la última que ya empezó (justo al principio ya cuenta)', () => {
    expect(lastStartedIndex(P, 0, 0)).toBe(-1)
    expect(lastStartedIndex(P, 3.5, 0)).toBe(0)
    expect(lastStartedIndex(P, 4, 0)).toBe(1)
    expect(lastStartedIndex(P, 3.99, 0)).toBe(1) // margen chico
    expect(lastStartedIndex(P, 20, 0)).toBe(2)
  })
  it('phraseTarget: anterior / repetir / siguiente', () => {
    expect([0, 2, 5, 8.5].map((t) => phraseTarget(P, t, 0, 'next'))).toEqual([0, 1, 2, null])
    expect([0, 2, 5, 8.5].map((t) => phraseTarget(P, t, 0, 'prev'))).toEqual([0, 0, 0, 1])
    expect([0, 2, 5, 8.5].map((t) => phraseTarget(P, t, 0, 'repeat'))).toEqual([0, 0, 1, 2])
    expect(phraseTarget([], 3, 0, 'next')).toBeNull()
  })
  it('phraseStartAt / phraseEndAt: en el tiempo del video, nunca negativo', () => {
    expect(phraseStartAt(P[1], 0.5)).toBe(4.5)
    expect(phraseEndAt(P[1], 0.5)).toBe(6.5)
    expect(phraseStartAt(P[0], -2)).toBe(0)
  })
})

describe('isNewAssignment y newestFirst — "Nuevo" y lo último primero', () => {
  const now = new Date(2026, 9, 6, 12, 0) // martes 6/10, hora local
  it('"Nuevo" = asignado en los últimos 7 días de calendario', () => {
    expect(isNewAssignment(new Date(2026, 9, 6, 8, 0), now)).toBe(true)  // hoy
    expect(isNewAssignment(new Date(2026, 8, 30, 23, 59), now)).toBe(true) // hace 6 días
    expect(isNewAssignment(new Date(2026, 8, 29, 23, 59), now)).toBe(false) // hace 7 días
    expect(isNewAssignment('nada', now)).toBe(false)
  })
  it('ordena por fecha de asignación, lo último primero; sin fecha válida al final', () => {
    const a = { id: 'a', assignedAt: '2026-09-01T12:00:00Z' }
    const b = { id: 'b', assignedAt: '2026-10-05T12:00:00Z' }
    const c = { id: 'c', assignedAt: 'nada' }
    expect(newestFirst([a, c, b]).map((x) => x.id)).toEqual(['b', 'a', 'c'])
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
