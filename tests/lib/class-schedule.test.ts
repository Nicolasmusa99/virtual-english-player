// Calendario (C1) — funciones puras de lib/classSchedule.ts.
import { describe, it, expect } from 'vitest'
import {
  addDays, buildSchedule, CLASS_TZ, dateInTz, expandSeries, formatTime, isDateStr, isDurationOk,
  isOccurrence, isWeekday, minuteInTz, normalizeMeetUrl, parseRange, parseTime, weekdayOf, zonedToUtc,
  type EventRow, type SeriesRow,
} from '@/lib/classSchedule'

const Z = (iso: string) => new Date(iso)

// Serie: martes 18:00 (BA) = 21:00 UTC, 60 min, desde el martes 29/9/2026.
const TUE: SeriesRow = {
  id: 's-tue', weekday: 2, startMinute: 18 * 60, durationMin: 60,
  startsOn: '2026-09-29', endsOn: null, meetUrl: 'https://meet.google.com/abc-defg-hij',
}

describe('validación de lo que carga el profe', () => {
  it('parseTime / formatTime', () => {
    expect(parseTime('18:00')).toBe(1080)
    expect(parseTime('00:00')).toBe(0)
    expect(parseTime('23:59')).toBe(1439)
    for (const bad of ['24:00', '9:00', '18:60', '18:00:00', '', null, 1080]) expect(parseTime(bad), String(bad)).toBeNull()
    expect(formatTime(1080)).toBe('18:00')
    expect(formatTime(5)).toBe('00:05')
  })
  it('isDateStr: solo fechas que existen', () => {
    expect(isDateStr('2026-09-29')).toBe(true)
    expect(isDateStr('2028-02-29')).toBe(true)
    for (const bad of ['2026-02-30', '2026-13-01', '26-09-29', '2026-9-29', '', null]) expect(isDateStr(bad), String(bad)).toBe(false)
  })
  it('duración 15..240 min enteros; día 0..6', () => {
    expect(isDurationOk(60)).toBe(true)
    for (const bad of [14, 241, 30.5, '60', null]) expect(isDurationOk(bad), String(bad)).toBe(false)
    expect(isWeekday(0) && isWeekday(6)).toBe(true)
    for (const bad of [-1, 7, 2.5, '2']) expect(isWeekday(bad), String(bad)).toBe(false)
  })
})

describe('normalizeMeetUrl — solo Zoom / Meet / Teams por https', () => {
  it('acepta los links de clase', () => {
    for (const u of [
      'https://meet.google.com/abc-defg-hij',
      'https://zoom.us/j/123456789',
      'https://us02web.zoom.us/j/123456789?pwd=abc',
      'https://teams.microsoft.com/l/meetup-join/xyz',
      'https://teams.live.com/meet/123',
    ]) expect(normalizeMeetUrl(u), u).toEqual({ ok: true, url: new URL(u).href })
  })
  it('vacío → sin link', () => {
    expect(normalizeMeetUrl('')).toEqual({ ok: true, url: null })
    expect(normalizeMeetUrl(null)).toEqual({ ok: true, url: null })
    expect(normalizeMeetUrl(undefined)).toEqual({ ok: true, url: null })
  })
  it('rechaza todo lo demás', () => {
    for (const u of [
      'http://zoom.us/j/1', // sin https
      'https://evil.com/zoom.us', 'https://zoom.us.evil.com/j/1', 'https://evilzoom.us/j/1',
      'https://user:pass@zoom.us/j/1', 'https://zoom.us:8443/j/1',
      'javascript:alert(1)', 'meet.google.com/abc', 'https://' + 'a'.repeat(600) + '.zoom.us',
      42, {},
    ]) expect(normalizeMeetUrl(u), String(u).slice(0, 40)).toEqual({ ok: false })
  })
})

describe('zona horaria', () => {
  it('Buenos Aires es UTC−3 todo el año (sin horario de verano)', () => {
    expect(zonedToUtc('2026-09-29', 1080).toISOString()).toBe('2026-09-29T21:00:00.000Z')
    expect(zonedToUtc('2026-01-15', 1080).toISOString()).toBe('2026-01-15T21:00:00.000Z')
    expect(zonedToUtc('2026-07-15', 0).toISOString()).toBe('2026-07-15T03:00:00.000Z')
  })
  it('funciona con una zona CON horario de verano (Madrid)', () => {
    expect(zonedToUtc('2026-07-01', 1080, 'Europe/Madrid').toISOString()).toBe('2026-07-01T16:00:00.000Z')
    expect(zonedToUtc('2026-01-15', 1080, 'Europe/Madrid').toISOString()).toBe('2026-01-15T17:00:00.000Z')
  })
  it('dateInTz / minuteInTz: el día y la hora en BA de un instante', () => {
    expect(dateInTz(Z('2026-09-30T02:30:00Z'))).toBe('2026-09-29') // 23:30 del 29 en BA
    expect(minuteInTz(Z('2026-09-30T02:30:00Z'))).toBe(23 * 60 + 30)
    expect(CLASS_TZ).toBe('America/Argentina/Buenos_Aires')
  })
  it('addDays / weekdayOf (cruza meses y años)', () => {
    expect(addDays('2026-09-29', 7)).toBe('2026-10-06')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(weekdayOf('2026-09-29')).toBe(2) // martes
    expect(weekdayOf('2026-10-04')).toBe(0) // domingo
  })
})

describe('expandSeries — el horario fijo se repite solo', () => {
  it('todos los martes a las 18:00 BA dentro del rango', () => {
    const got = expandSeries(TUE, Z('2026-09-28T00:00:00Z'), Z('2026-10-21T00:00:00Z')).map((d) => d.toISOString())
    expect(got).toEqual(['2026-09-29T21:00:00.000Z', '2026-10-06T21:00:00.000Z', '2026-10-13T21:00:00.000Z', '2026-10-20T21:00:00.000Z'])
  })
  it('no hay clases antes de startsOn ni después de endsOn (inclusive)', () => {
    const s = { ...TUE, startsOn: '2026-10-06', endsOn: '2026-10-13' }
    const got = expandSeries(s, Z('2026-09-01T00:00:00Z'), Z('2026-11-30T00:00:00Z')).map((d) => d.toISOString())
    expect(got).toEqual(['2026-10-06T21:00:00.000Z', '2026-10-13T21:00:00.000Z'])
  })
  it('una clase en curso cuenta (empezó antes de `from` y todavía no terminó)', () => {
    const got = expandSeries(TUE, Z('2026-09-29T21:30:00Z'), Z('2026-10-01T00:00:00Z'))
    expect(got.map((d) => d.toISOString())).toEqual(['2026-09-29T21:00:00.000Z'])
    expect(expandSeries(TUE, Z('2026-09-29T22:00:00Z'), Z('2026-10-01T00:00:00Z'))).toEqual([]) // ya terminó
  })
  it('clase tarde (23:30 BA) cae al día siguiente en UTC, pero sigue siendo "el martes"', () => {
    const s = { ...TUE, startMinute: 23 * 60 + 30 }
    const got = expandSeries(s, Z('2026-09-29T00:00:00Z'), Z('2026-10-01T12:00:00Z'))
    expect(got.map((d) => d.toISOString())).toEqual(['2026-09-30T02:30:00.000Z'])
  })
  it('rango vacío o invertido → nada', () => {
    expect(expandSeries(TUE, Z('2026-10-10T00:00:00Z'), Z('2026-10-01T00:00:00Z'))).toEqual([])
  })
  it('isOccurrence: solo los martes 18:00 reales de la serie', () => {
    expect(isOccurrence(TUE, Z('2026-10-06T21:00:00Z'))).toBe(true)
    expect(isOccurrence(TUE, Z('2026-10-06T21:01:00Z'))).toBe(false)
    expect(isOccurrence(TUE, Z('2026-10-07T21:00:00Z'))).toBe(false) // miércoles
    expect(isOccurrence(TUE, Z('2026-09-22T21:00:00Z'))).toBe(false) // antes de startsOn
    expect(isOccurrence({ ...TUE, endsOn: '2026-10-01' }, Z('2026-10-06T21:00:00Z'))).toBe(false)
  })
})

describe('buildSchedule — horario fijo + excepciones + sueltas', () => {
  const FROM = Z('2026-09-28T00:00:00Z')
  const TO = Z('2026-10-21T00:00:00Z')
  const ev = (e: Partial<EventRow> & { id: string; startsAt: Date }): EventRow => ({
    seriesId: null, originalStartsAt: null, durationMin: 60, status: 'scheduled', meetUrl: null, ...e,
  })

  it('solo horario fijo: 4 martes, con el link de la serie', () => {
    const got = buildSchedule([TUE], [], FROM, TO)
    expect(got).toHaveLength(4)
    expect(got[0]).toMatchObject({ seriesId: 's-tue', eventId: null, status: 'scheduled', meetUrl: TUE.meetUrl, originalStartsAt: null })
    expect(got[0].key).toBe(`s-tue:${Z('2026-09-29T21:00:00Z').getTime()}`)
  })

  it('cancelar un martes: aparece UNA vez, como cancelada', () => {
    const got = buildSchedule([TUE], [ev({
      id: 'e1', seriesId: 's-tue', originalStartsAt: Z('2026-10-06T21:00:00Z'), startsAt: Z('2026-10-06T21:00:00Z'), status: 'cancelled',
    })], FROM, TO)
    expect(got).toHaveLength(4)
    const oct6 = got.filter((c) => c.startsAt.toISOString() === '2026-10-06T21:00:00.000Z')
    expect(oct6).toEqual([expect.objectContaining({ eventId: 'e1', status: 'cancelled', originalStartsAt: Z('2026-10-06T21:00:00Z') })])
  })

  it('mover un martes al jueves: desaparece el martes, aparece el jueves (con el link de la serie)', () => {
    const got = buildSchedule([TUE], [ev({
      id: 'e2', seriesId: 's-tue', originalStartsAt: Z('2026-10-06T21:00:00Z'), startsAt: Z('2026-10-08T20:00:00Z'), durationMin: 90,
    })], FROM, TO)
    const iso = got.map((c) => c.startsAt.toISOString())
    expect(iso).not.toContain('2026-10-06T21:00:00.000Z')
    expect(iso).toContain('2026-10-08T20:00:00.000Z')
    expect(got.find((c) => c.eventId === 'e2')).toMatchObject({ durationMin: 90, meetUrl: TUE.meetUrl, status: 'scheduled' })
  })

  it('moverlo FUERA del rango: el martes original igual desaparece', () => {
    const got = buildSchedule([TUE], [ev({
      id: 'e3', seriesId: 's-tue', originalStartsAt: Z('2026-10-06T21:00:00Z'), startsAt: Z('2026-12-01T21:00:00Z'),
    })], FROM, TO)
    expect(got.map((c) => c.startsAt.toISOString())).not.toContain('2026-10-06T21:00:00.000Z')
    expect(got).toHaveLength(3)
  })

  it('moverlo DESDE fuera del rango hacia adentro: aparece', () => {
    const got = buildSchedule([TUE], [ev({
      id: 'e4', seriesId: 's-tue', originalStartsAt: Z('2026-11-03T21:00:00Z'), startsAt: Z('2026-10-15T21:00:00Z'),
    })], FROM, TO)
    expect(got.map((c) => c.eventId)).toContain('e4')
  })

  it('clase suelta: aparece con su propio link, ordenada entre las fijas', () => {
    const got = buildSchedule([TUE], [ev({ id: 'e5', startsAt: Z('2026-10-01T20:00:00Z'), meetUrl: 'https://zoom.us/j/1' })], FROM, TO)
    expect(got.map((c) => c.key)[1]).toBe('e5')
    expect(got[1]).toMatchObject({ seriesId: null, meetUrl: 'https://zoom.us/j/1', originalStartsAt: null })
  })

  it('excepción huérfana (su "original" ya no es clase de la serie) → se ignora y el martes real queda', () => {
    const got = buildSchedule([TUE], [ev({
      id: 'e6', seriesId: 's-tue', originalStartsAt: Z('2026-10-07T21:00:00Z'), startsAt: Z('2026-10-07T21:00:00Z'), status: 'cancelled',
    })], FROM, TO)
    expect(got).toHaveLength(4)
    expect(got.map((c) => c.eventId)).not.toContain('e6')
  })

  it('excepción de una serie que no vino (de otro profe) → se ignora', () => {
    const got = buildSchedule([], [ev({
      id: 'e7', seriesId: 's-otro', originalStartsAt: Z('2026-10-06T21:00:00Z'), startsAt: Z('2026-10-08T21:00:00Z'),
    })], FROM, TO)
    expect(got).toEqual([])
  })

  it('evento con serie pero sin original (forma inválida) → se ignora', () => {
    expect(buildSchedule([TUE], [ev({ id: 'e8', seriesId: 's-tue', startsAt: Z('2026-10-01T20:00:00Z') })], FROM, TO)
      .map((c) => c.eventId)).not.toContain('e8')
  })
})

describe('parseRange', () => {
  const NOW = Z('2026-09-29T12:00:00Z')
  it('sin parámetros: desde ahora (menos el margen) y N días', () => {
    const r = parseRange(null, null, NOW, 35, 120)
    expect(r).toEqual({ ok: true, from: Z('2026-09-29T10:00:00Z'), to: new Date(Z('2026-09-29T10:00:00Z').getTime() + 35 * 86_400_000) })
  })
  it('con parámetros', () => {
    expect(parseRange('2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', NOW, 35)).toEqual({ ok: true, from: Z('2026-10-01T00:00:00Z'), to: Z('2026-11-01T00:00:00Z') })
  })
  it('inválido, invertido o más de 100 días → error', () => {
    expect(parseRange('nada', null, NOW, 35).ok).toBe(false)
    expect(parseRange('2026-11-01T00:00:00Z', '2026-10-01T00:00:00Z', NOW, 35).ok).toBe(false)
    expect(parseRange('2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z', NOW, 35).ok).toBe(false)
  })
})
