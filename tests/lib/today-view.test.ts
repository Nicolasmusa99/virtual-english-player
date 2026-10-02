// Rediseño (fase 2) — "Hoy" del profe: funciones puras (lib/todayView.ts). Hora de Argentina.
import { describe, it, expect } from 'vitest'
import { nextIndex, nowLineIndex, todaySummary, untilLabel, type DayClass } from '@/lib/todayView'

const at = (hm: string, durationMin = 60, status: DayClass['status'] = 'scheduled'): DayClass =>
  ({ startsAt: new Date(`2026-10-01T${hm}:00-03:00`).toISOString(), durationMin, status })
const now = (hm: string) => new Date(`2026-10-01T${hm}:00-03:00`)
const DAY = [at('11:00', 90, 'cancelled'), at('18:00'), at('19:30', 45)]
const names = ['Lucía', 'Martina', 'Tomás']

describe('nextIndex: la próxima clase (programada y sin terminar)', () => {
  it('salta las canceladas y las que ya terminaron; una en curso cuenta', () => {
    expect(nextIndex(DAY, now('10:00'))).toBe(1) // la de las 11 está cancelada
    expect(nextIndex(DAY, now('18:30'))).toBe(1) // en curso
    expect(nextIndex(DAY, now('19:00'))).toBe(2)
    expect(nextIndex(DAY, now('21:00'))).toBe(-1)
  })
})

describe('nowLineIndex: dónde va la raya de "ahora"', () => {
  it('antes de la primera clase que todavía no empezó', () => {
    expect(nowLineIndex(DAY, now('09:00'))).toBe(0)
    expect(nowLineIndex(DAY, now('14:40'))).toBe(1)
    expect(nowLineIndex(DAY, now('18:30'))).toBe(2) // la de las 18 ya empezó
    expect(nowLineIndex(DAY, now('22:00'))).toBe(3) // al final
  })
})

describe('untilLabel: cuánto falta', () => {
  it('en minutos, en horas, en horas y minutos; en curso; terminada', () => {
    expect(untilLabel(at('18:00'), now('17:35'))).toBe('En 25 min')
    expect(untilLabel(at('18:00'), now('16:00'))).toBe('En 2 h')
    expect(untilLabel(at('18:00'), now('14:40'))).toBe('En 3 h 20 min')
    expect(untilLabel(at('18:00'), now('18:10'))).toBe('Ahora, hasta las 19:00')
    expect(untilLabel(at('18:00'), now('19:00'))).toBe('Terminó')
  })
  it('redondea para arriba: a 30 segundos dice "En 1 min", no "En 0 min"', () => {
    expect(untilLabel(at('18:00'), new Date(now('18:00').getTime() - 30_000))).toBe('En 1 min')
  })
})

describe('todaySummary: la frase de arriba', () => {
  const sum = (classes: DayClass[], hm: string) => todaySummary(classes, now(hm), (i) => names[i])
  it('cuenta solo las programadas y dice la próxima', () => {
    expect(sum(DAY, '14:40')).toBe('Tenés 2 clases. La próxima es a las 18:00 con Martina.')
    expect(sum(DAY, '18:20')).toBe('Tenés 2 clases. Ahora estás en clase con Martina.')
    expect(sum(DAY, '22:00')).toBe('Tenés 2 clases. Ya terminaron todas.')
    expect(sum([at('18:00')], '20:00')).toBe('Tenés 1 clase. Ya terminó.')
  })
  it('sin clases, o todas canceladas', () => {
    expect(sum([], '10:00')).toBe('Hoy no tenés clases.')
    expect(sum([at('11:00', 60, 'cancelled')], '10:00')).toBe('Hoy no tenés clases: la única está cancelada.')
    expect(sum([at('11:00', 60, 'cancelled'), at('12:00', 60, 'cancelled')], '10:00')).toBe('Hoy no tenés clases: están todas canceladas.')
  })
})
