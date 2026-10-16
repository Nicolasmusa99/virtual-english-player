// Calendario (G1) — ventana "Crear / Editar clase": funciones puras de lib/classDraft.ts.
import { describe, it, expect } from 'vitest'
import {
  addMinutes, draftDuration, draftError, draftWeekdays, durationLabel, repeatChanged, repeatLabel,
  seriesBody, singleBody, type ClassDraft,
} from '@/lib/classDraft'

// Martes 6/10/2026, 18:00–19:00, no se repite, Mi sala de Zoom.
const D: ClassDraft = { date: '2026-10-06', start: '18:00', end: '19:00', repeat: 'none', days: [], endsOn: null, link: '' }
// "Ahora" para validar: jueves 1/10/2026 12:00 en Buenos Aires (D queda en el futuro).
const NOW = new Date('2026-10-01T15:00:00Z')

describe('repetición', () => {
  it('textos de las opciones (de lunes a domingo)', () => {
    expect(repeatLabel([2])).toBe('Todas las semanas el martes')
    expect(repeatLabel([4, 2])).toBe('Todas las semanas el martes y el jueves')
    expect(repeatLabel([5, 1, 3])).toBe('Todas las semanas el lunes, el miércoles y el viernes')
    expect(repeatLabel([0, 6])).toBe('Todas las semanas el sábado y el domingo')
    expect(repeatLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Todos los días')
  })
  it('días que pide cada modo', () => {
    expect(draftWeekdays(D)).toEqual([])
    expect(draftWeekdays({ ...D, repeat: 'weekly' })).toEqual([2]) // el día de la fecha
    expect(draftWeekdays({ ...D, repeat: 'custom', days: [4, 2, 4] })).toEqual([2, 4])
  })
  it('"Solo esta" no sirve si cambió cómo se repite (días o fin)', () => {
    const before = { ...D, repeat: 'weekly' as const }
    expect(repeatChanged(before, { ...before, start: '19:00', link: 'https://zoom.us/j/1' })).toBe(false)
    expect(repeatChanged(before, { ...before, repeat: 'custom', days: [2] })).toBe(false) // mismos días
    expect(repeatChanged(before, { ...before, repeat: 'custom', days: [2, 4] })).toBe(true)
    expect(repeatChanged(before, { ...before, endsOn: '2026-12-15' })).toBe(true)
    expect(repeatChanged(before, { ...before, date: '2026-10-08' })).toBe(true) // jueves: otro día
  })
})

describe('duración', () => {
  it('entre inicio y fin, de 15 min a 4 h', () => {
    expect(draftDuration(D)).toBe(60)
    expect(draftDuration({ start: '18:00', end: '19:30' })).toBe(90)
    expect(draftDuration({ start: '18:00', end: '18:10' })).toBeNull()
    expect(draftDuration({ start: '18:00', end: '17:00' })).toBeNull() // no cruza la medianoche
    expect(draftDuration({ start: '08:00', end: '13:00' })).toBeNull() // más de 4 h
    expect(draftDuration({ start: 'x', end: '19:00' })).toBeNull()
  })
  it('textos y suma', () => {
    expect([durationLabel(60), durationLabel(45), durationLabel(90), durationLabel(120)]).toEqual(['1 h', '45 min', '1 h 30 min', '2 h'])
    expect(addMinutes('18:00', 60)).toBe('19:00')
    expect(addMinutes('23:30', 60)).toBe('23:59')
  })
})

describe('validación antes de mandar', () => {
  it('ok', () => {
    expect(draftError(D, NOW)).toBeNull()
    expect(draftError({ ...D, repeat: 'custom', days: [2, 4], endsOn: '2026-12-15' }, NOW)).toBeNull()
  })
  it('lo que falta o está mal', () => {
    expect(draftError({ ...D, date: '' }, NOW)).toMatch(/fecha/)
    expect(draftError({ ...D, start: '' }, NOW)).toMatch(/hora/)
    expect(draftError({ ...D, end: '18:05' }, NOW)).toMatch(/durar/)
    expect(draftError({ ...D, repeat: 'custom', days: [] }, NOW)).toMatch(/al menos un día/)
    expect(draftError({ ...D, repeat: 'weekly', endsOn: '2026-10-01' }, NOW)).toMatch(/terminar antes/)
    expect(draftError({ ...D, endsOn: '2026-10-01' }, NOW)).toBeNull() // sin repetir, el fin no importa
  })
  it('una clase que no se repite no puede ser en el pasado (hora de Buenos Aires)', () => {
    const PAST = 'La clase no puede ser en el pasado'
    expect(draftError({ ...D, date: '2026-09-30' }, NOW)).toBe(PAST) // ayer
    expect(draftError({ ...D, date: '2026-10-01', start: '11:30', end: '12:30' }, NOW)).toBe(PAST) // hoy, más temprano
    expect(draftError({ ...D, date: '2026-10-01', start: '12:30', end: '13:30' }, NOW)).toBeNull() // hoy, más tarde
    expect(draftError({ ...D, date: '2026-10-01', start: '12:00', end: '13:00' }, new Date('2026-10-01T15:00:50Z'))).toBeNull() // "ahora mismo": 1 min de margen
  })
  it('un horario que se repite puede empezar antes de hoy', () => {
    expect(draftError({ ...D, date: '2026-09-01', repeat: 'weekly' }, NOW)).toBeNull()
    expect(draftError({ ...D, date: '2026-09-01', repeat: 'custom', days: [2, 4] }, NOW)).toBeNull()
  })
  it('al editar una clase que ya pasó sin tocar cuándo es, se puede guardar (p. ej. el link)', () => {
    const old = { ...D, date: '2026-09-29' }
    expect(draftError({ ...old, link: 'https://zoom.us/j/9' }, NOW, old)).toBeNull()
    expect(draftError({ ...old, start: '19:00', end: '20:00' }, NOW, old)).toMatch(/pasado/) // la movió, sigue en el pasado
  })
})

describe('lo que va a la API', () => {
  it('horario nuevo', () => {
    expect(seriesBody({ ...D, repeat: 'custom', days: [4, 2], endsOn: '2026-12-15', link: ' https://zoom.us/j/1 ' })).toEqual({
      weekdays: [2, 4], time: '18:00', durationMin: 60, startsOn: '2026-10-06', endsOn: '2026-12-15', meetUrl: 'https://zoom.us/j/1',
    })
  })
  it('clase suelta (link vacío = Mi sala de Zoom)', () => {
    expect(singleBody({ ...D, end: '19:30' })).toEqual({ date: '2026-10-06', time: '18:00', durationMin: 90, meetUrl: '' })
  })
})
