// Calendario (G2) — "Mi agenda": funciones puras de la grilla semanal (lib/agendaView.ts).
// Todo en hora de Argentina (UTC−3, sin horario de verano).
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_HOURS, STUDENT_COLORS, dayHead, dayLong, dayTitle, hourBounds, placeClasses, slotTime, studentLabels,
  weekDays, weekRange, weekStartOf, weekTitle,
} from '@/lib/agendaView'

// Una clase a las HH:MM de Buenos Aires de ese día.
const at = (day: string, hm: string, durationMin = 60, key = `${day} ${hm}`) =>
  ({ key, startsAt: new Date(`${day}T${hm}:00-03:00`).toISOString(), durationMin })

describe('semanas de lunes a domingo', () => {
  it('weekStartOf: el lunes de la semana (también desde el domingo y desde el mismo lunes)', () => {
    expect(weekStartOf('2026-09-29')).toBe('2026-09-28') // martes
    expect(weekStartOf('2026-10-04')).toBe('2026-09-28') // domingo
    expect(weekStartOf('2026-09-28')).toBe('2026-09-28') // lunes
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28') // cruza el año
  })
  it('weekDays: 7 días, de lunes a domingo', () => {
    expect(weekDays('2026-09-28')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  })
  it('weekRange: de lunes 00:00 a lunes 00:00 en hora de Argentina', () => {
    const { from, to } = weekRange('2026-09-28')
    expect(from.toISOString()).toBe('2026-09-28T03:00:00.000Z')
    expect(to.toISOString()).toBe('2026-10-05T03:00:00.000Z')
  })
  it('weekTitle: como Google ("28 sep – 4 oct 2026")', () => {
    expect(weekTitle('2026-09-28')).toBe('28 sep – 4 oct 2026')
    expect(weekTitle('2026-10-05')).toBe('5 – 11 oct 2026')
    expect(weekTitle('2026-12-28')).toBe('28 dic 2026 – 3 ene 2027')
  })
  it('cabeceras de los días', () => {
    expect(dayHead('2026-09-29')).toEqual({ short: 'MAR', letter: 'M', num: 29 })
    expect(dayHead('2026-09-30').short).toBe('MIÉ')
    expect(dayHead('2026-10-03').short).toBe('SÁB')
    expect(dayTitle('2026-09-29')).toBe('Martes 29')
    expect(dayLong('2026-10-06')).toBe('martes 6 de octubre')
  })
})

describe('grilla horaria', () => {
  it('hourBounds: de 8 a 22 si todo entra; se agranda si una clase se sale', () => {
    expect(hourBounds([])).toEqual(DEFAULT_HOURS)
    expect(hourBounds([at('2026-09-29', '18:00')])).toEqual({ from: 8, to: 22 })
    expect(hourBounds([at('2026-09-29', '07:30')])).toEqual({ from: 7, to: 22 })
    expect(hourBounds([at('2026-09-29', '21:30')])).toEqual({ from: 8, to: 23 })
    expect(hourBounds([at('2026-09-29', '23:00', 60)])).toEqual({ from: 8, to: 24 })
  })
  it('slotTime: dónde se hizo clic → hora de inicio, de a media hora', () => {
    expect(slotTime(0, 8)).toBe('08:00')
    expect(slotTime(29, 8)).toBe('08:00')
    expect(slotTime(30, 8)).toBe('08:30')
    expect(slotTime(600, 8)).toBe('18:00')
    expect(slotTime(-40, 8)).toBe('08:00')
    expect(slotTime(99_999, 8)).toBe('23:30')
  })
})

describe('placeClasses: cada clase en su día, y las que se superponen, lado a lado', () => {
  const days = weekDays('2026-09-28')
  it('ubica cada clase en su día y su minuto (y deja afuera las de otros días)', () => {
    const out = placeClasses([at('2026-09-29', '18:00', 45), at('2026-10-06', '18:00')], days)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ day: '2026-09-29', startMin: 1080, endMin: 1125, col: 0, cols: 1 })
  })
  it('dos clases a la vez → dos columnas; la que viene después, sola, ocupa todo el ancho', () => {
    const out = placeClasses([at('2026-09-29', '18:00', 60, 'A'), at('2026-09-29', '18:30', 60, 'B'), at('2026-09-29', '19:30', 30, 'C')], days)
    const by = Object.fromEntries(out.map((p) => [p.item.key, p]))
    expect(by.A).toMatchObject({ col: 0, cols: 2 })
    expect(by.B).toMatchObject({ col: 1, cols: 2 })
    expect(by.C).toMatchObject({ col: 0, cols: 1 })
  })
  it('una clase larga con dos cortas encima: la segunda corta reusa la columna libre', () => {
    const out = placeClasses([at('2026-09-29', '18:00', 180, 'L'), at('2026-09-29', '18:00', 60, 'B'), at('2026-09-29', '19:00', 60, 'C')], days)
    const by = Object.fromEntries(out.map((p) => [p.item.key, p]))
    expect(by.L).toMatchObject({ col: 0, cols: 2 })
    expect(by.B).toMatchObject({ col: 1, cols: 2 })
    expect(by.C).toMatchObject({ col: 1, cols: 2 })
  })
  it('una que termina justo cuando empieza otra NO se superpone', () => {
    const out = placeClasses([at('2026-09-29', '18:00', 60, 'A'), at('2026-09-29', '19:00', 60, 'B')], days)
    expect(out.every((p) => p.cols === 1)).toBe(true)
  })
})

describe('studentLabels: nombre corto y color fijo por alumno', () => {
  const S = (id: string, name: string | null, email: string | null = `${id}@x.com`) => ({ id, name, email })
  it('primer nombre; nombre completo si dos comparten el primero; sin nombre, el mail antes de la @', () => {
    const m = studentLabels([S('1', 'Martina Pérez'), S('2', 'Lucía Gómez'), S('3', 'Lucía Fernández'), S('4', null, 'tomi.r@gmail.com')])
    expect(m.get('1')).toMatchObject({ label: 'Martina', full: 'Martina Pérez' })
    expect(m.get('2')?.label).toBe('Lucía Gómez')
    expect(m.get('3')?.label).toBe('Lucía Fernández')
    expect(m.get('4')).toMatchObject({ label: 'tomi.r', full: 'tomi.r' })
  })
  it('el color sale del orden alfabético de TODOS los alumnos (no cambia según la semana)', () => {
    const m = studentLabels([S('t', 'Tomás'), S('m', 'Martina'), S('l', 'Lucía')])
    expect([m.get('l')?.color, m.get('m')?.color, m.get('t')?.color]).toEqual([0, 1, 2])
    const many = studentLabels(Array.from({ length: 10 }, (_, i) => S(String(i), `Alumno ${String(i).padStart(2, '0')}`)))
    expect(many.get('8')?.color).toBe(8 % STUDENT_COLORS)
  })
})
