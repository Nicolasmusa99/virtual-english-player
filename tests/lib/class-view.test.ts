// Calendario (C3) — funciones de presentación (lib/classView.ts).
import { describe, it, expect } from 'vitest'
import {
  byDay, calendarLeaf, classKind, dayMonth, differsFromClassTz, formDate, formTime, hhmm, longDate, meetLabel,
  monthGrid, monthRange, monthTitle, nextClassTitle, relativeDay, seriesTitle, shiftMonth, shortDate, splitUpcoming,
  timeRange, type TeacherClass,
} from '@/lib/classView'

const BA = 'America/Argentina/Buenos_Aires'
const MAD = 'Europe/Madrid'
const Z = (iso: string) => new Date(iso)
const NOW = Z('2026-09-29T15:00:00Z') // martes 29/9, 12:00 en BA

describe('fechas y horas', () => {
  it('hora, rango, fecha corta y larga en la zona pedida', () => {
    const t = Z('2026-09-29T21:00:00Z') // 18:00 BA · 23:00 Madrid
    expect(hhmm(t, BA)).toBe('18:00')
    expect(hhmm(t, MAD)).toBe('23:00')
    expect(timeRange(t, 60, BA)).toBe('18:00–19:00')
    expect(timeRange(Z('2026-09-29T21:30:00Z'), 90, MAD)).toBe('23:30–01:00')
    expect(shortDate(t, BA)).toBe('Mar 29/9')
    expect(shortDate(Z('2026-09-30T02:30:00Z'), BA)).toBe('Mar 29/9') // 23:30 BA sigue siendo martes
    expect(shortDate(Z('2026-09-30T02:30:00Z'), MAD)).toBe('Mié 30/9')
    expect(longDate(t, BA)).toBe('martes 29 de septiembre')
  })
  it('Hoy / Mañana / nada, por día de calendario', () => {
    expect(relativeDay(Z('2026-09-29T21:00:00Z'), NOW, BA)).toBe('Hoy')
    expect(relativeDay(Z('2026-09-30T12:00:00Z'), NOW, BA)).toBe('Mañana')
    expect(relativeDay(Z('2026-10-01T12:00:00Z'), NOW, BA)).toBeNull()
    expect(relativeDay(Z('2026-09-30T02:30:00Z'), NOW, BA)).toBe('Hoy') // 23:30 del 29 en BA
  })
  it('título de la próxima clase y la hojita del calendario', () => {
    expect(nextClassTitle(Z('2026-09-29T21:00:00Z'), NOW, BA)).toBe('Hoy, martes 29 · 18:00')
    expect(nextClassTitle(Z('2026-09-30T21:00:00Z'), NOW, BA)).toBe('Mañana, miércoles 30 · 18:00')
    expect(nextClassTitle(Z('2026-10-15T20:00:00Z'), NOW, BA)).toBe('Jueves 15 de octubre · 17:00')
    expect(calendarLeaf(Z('2026-09-29T21:00:00Z'), BA)).toEqual({ month: 'sep', day: 29 })
  })
  it('plataforma del link', () => {
    expect(meetLabel('https://meet.google.com/abc')).toBe('Google Meet')
    expect(meetLabel('https://us02web.zoom.us/j/1')).toBe('Zoom')
    expect(meetLabel('https://teams.microsoft.com/l/x')).toBe('Teams')
    expect(meetLabel(null)).toBeNull()
    expect(meetLabel('nada')).toBeNull()
  })
  it('¿el dispositivo ve otra hora que Argentina?', () => {
    expect(differsFromClassTz(Z('2026-09-29T21:00:00Z'), BA)).toBe(false)
    expect(differsFromClassTz(Z('2026-09-29T21:00:00Z'), 'America/Sao_Paulo')).toBe(false) // también UTC−3
    expect(differsFromClassTz(Z('2026-09-29T21:00:00Z'), MAD)).toBe(true)
  })
})

describe('splitUpcoming — la próxima clase y las siguientes', () => {
  const c = (startsAt: string, status: 'scheduled' | 'cancelled' = 'scheduled', durationMin = 60) => ({ startsAt, status, durationMin })
  it('la próxima es la primera programada que no terminó (una en curso cuenta)', () => {
    const list = [c('2026-09-29T14:30:00.000Z'), c('2026-09-29T21:00:00.000Z'), c('2026-10-02T13:30:00.000Z')]
    expect(splitUpcoming(list, NOW).next).toEqual(list[0]) // 14:30–15:30 UTC: en curso a las 15:00
    expect(splitUpcoming(list, Z('2026-09-29T15:31:00Z')).next).toEqual(list[1])
  })
  it('una cancelada nunca es "la próxima", pero sale en la lista (tachada)', () => {
    const list = [c('2026-10-06T21:00:00.000Z', 'cancelled'), c('2026-10-13T21:00:00.000Z'), c('2026-10-20T21:00:00.000Z')]
    const r = splitUpcoming(list, NOW)
    expect(r.next).toEqual(list[1])
    expect(r.rest).toEqual([list[2]]) // la cancelada anterior a la próxima no se repite abajo
  })
  it('las siguientes: como mucho `more`, en orden', () => {
    const list = ['2026-10-27', '2026-10-06', '2026-10-13', '2026-10-20', '2026-11-03', '2026-11-10'].map((d) => c(d + 'T21:00:00.000Z'))
    const r = splitUpcoming(list, NOW, 3)
    expect(r.next?.startsAt).toBe('2026-10-06T21:00:00.000Z')
    expect(r.rest.map((x) => x.startsAt.slice(0, 10))).toEqual(['2026-10-13', '2026-10-20', '2026-10-27'])
  })
  it('sin clases programadas → next null', () => {
    expect(splitUpcoming([c('2026-10-06T21:00:00.000Z', 'cancelled')], NOW)).toEqual({ next: null, rest: [c('2026-10-06T21:00:00.000Z', 'cancelled')] })
    expect(splitUpcoming([], NOW)).toEqual({ next: null, rest: [] })
  })
})

describe('mes', () => {
  it('septiembre 2026 (empieza martes): 5 semanas de lunes a domingo', () => {
    const g = monthGrid(2026, 9)
    expect(g).toHaveLength(35)
    expect(g[0]).toEqual({ day: '2026-08-31', inMonth: false })
    expect(g[1]).toEqual({ day: '2026-09-01', inMonth: true })
    expect(g[30]).toEqual({ day: '2026-09-30', inMonth: true })
    expect(g[34]).toEqual({ day: '2026-10-04', inMonth: false })
  })
  it('un mes que necesita 6 semanas (agosto 2026 empieza sábado)', () => {
    const g = monthGrid(2026, 8)
    expect(g).toHaveLength(42)
    expect(g[0].day).toBe('2026-07-27')
    expect(g.filter((x) => x.inMonth)).toHaveLength(31)
  })
  it('febrero que entra justo en 4 semanas (febrero 2027 empieza lunes)', () => {
    expect(monthGrid(2027, 2)).toHaveLength(28)
  })
  it('rango del mes en la zona pedida; título; mes anterior/siguiente cruzando el año', () => {
    expect(monthRange(2026, 9, BA)).toEqual({ from: Z('2026-09-01T03:00:00Z'), to: Z('2026-10-01T03:00:00Z') })
    expect(monthRange(2026, 12, BA).to).toEqual(Z('2027-01-01T03:00:00Z'))
    expect(monthTitle(2026, 9)).toBe('Septiembre 2026')
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
  })
  it('byDay agrupa por día de la zona, en orden', () => {
    const m = byDay([{ startsAt: '2026-09-30T02:30:00.000Z' }, { startsAt: '2026-09-29T21:00:00.000Z' }], BA)
    expect([...m.keys()]).toEqual(['2026-09-29'])
    expect(m.get('2026-09-29')!.map((x) => x.startsAt)).toEqual(['2026-09-29T21:00:00.000Z', '2026-09-30T02:30:00.000Z'])
  })
})

describe('lado profe', () => {
  const base: TeacherClass = {
    key: 'k', seriesId: 's', eventId: null, startsAt: '2026-10-13T21:00:00.000Z', durationMin: 60,
    meetUrl: null, status: 'scheduled', originalStartsAt: null,
  }
  it('tipo de clase: fija / suelta / movida / cancelada', () => {
    expect(classKind(base)).toBe('fija')
    expect(classKind({ ...base, seriesId: null, eventId: 'e' })).toBe('suelta')
    expect(classKind({ ...base, eventId: 'e', originalStartsAt: base.startsAt, startsAt: '2026-10-15T20:00:00.000Z' })).toBe('movida')
    expect(classKind({ ...base, eventId: 'e', originalStartsAt: base.startsAt, status: 'cancelled' })).toBe('cancelada')
    expect(classKind({ ...base, seriesId: null, status: 'cancelled' })).toBe('cancelada')
  })
  it('formularios en hora de Buenos Aires; títulos', () => {
    expect(formDate(Z('2026-09-30T02:30:00Z'))).toBe('2026-09-29')
    expect(formTime(Z('2026-09-30T02:30:00Z'))).toBe('23:30')
    expect(seriesTitle(2, '18:00')).toBe('Todos los martes · 18:00')
    expect(seriesTitle(6, '10:00')).toBe('Todos los sábados · 10:00')
    expect(seriesTitle(0, '10:00')).toBe('Todos los domingos · 10:00')
    expect(dayMonth('2026-09-01')).toBe('1/9')
  })
})
