// Calendario (G1) — ventana "Crear / Editar clase": funciones puras de lib/classDraft.ts.
import { describe, it, expect } from 'vitest'
import {
  addMinutes, draftDuration, draftError, draftWeekdays, durationLabel, repeatChanged, repeatLabel,
  seriesBody, singleBody, type ClassDraft,
} from '@/lib/classDraft'

// Martes 6/10/2026, 18:00–19:00, no se repite, Mi sala de Zoom.
const D: ClassDraft = { date: '2026-10-06', start: '18:00', end: '19:00', repeat: 'none', days: [], endsOn: null, link: '' }

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
    expect(draftError(D)).toBeNull()
    expect(draftError({ ...D, repeat: 'custom', days: [2, 4], endsOn: '2026-12-15' })).toBeNull()
  })
  it('lo que falta o está mal', () => {
    expect(draftError({ ...D, date: '' })).toMatch(/fecha/)
    expect(draftError({ ...D, start: '' })).toMatch(/hora/)
    expect(draftError({ ...D, end: '18:05' })).toMatch(/durar/)
    expect(draftError({ ...D, repeat: 'custom', days: [] })).toMatch(/al menos un día/)
    expect(draftError({ ...D, repeat: 'weekly', endsOn: '2026-10-01' })).toMatch(/terminar antes/)
    expect(draftError({ ...D, endsOn: '2026-10-01' })).toBeNull() // sin repetir, el fin no importa
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
