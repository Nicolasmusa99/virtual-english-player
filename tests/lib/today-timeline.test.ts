import { describe, expect, it } from 'vitest'
import { dayTimeline, firstSteps, minutesOf } from '@/lib/todayView'

describe('dayTimeline', () => {
  it('sin clases no hay línea', () => { expect(dayTimeline([], 600)).toBeNull() })
  it('va de una hora antes a una después, con al menos 6 horas', () => {
    const t = dayTimeline([{ startMin: 18 * 60, durationMin: 60 }], 17 * 60 + 30)!
    expect(t.hours[0]).toBe(17)
    expect(t.hours.at(-1)).toBe(23)
    expect(t.items[0].left).toBeCloseTo(16.7, 1)
    expect(t.items[0].width).toBeCloseTo(16.7, 1)
    expect(t.nowLeft).toBeCloseTo(8.3, 1)
  })
  it('la hora actual queda afuera si no cae en el rango', () => {
    expect(dayTimeline([{ startMin: 18 * 60, durationMin: 60 }], 9 * 60)!.nowLeft).toBeNull()
  })
  it('varias clases: cada una en su lugar, sin pasarse del final', () => {
    const t = dayTimeline([{ startMin: 16 * 60, durationMin: 60 }, { startMin: 19 * 60 + 30, durationMin: 45 }], 0)!
    expect(t.hours).toEqual([15, 16, 17, 18, 19, 20, 21, 22])
    expect(t.items.every((i) => i.left >= 0 && i.left + i.width <= 100)).toBe(true)
  })
  it('una clase a última hora no se sale del día', () => {
    const t = dayTimeline([{ startMin: 23 * 60, durationMin: 120 }], 0)!
    expect(t.hours.at(-1)).toBe(24)
    expect(t.items[0].left + t.items[0].width).toBeLessThanOrEqual(100)
  })
})

describe('firstSteps', () => {
  it('marca lo hecho y cuál toca', () => {
    expect(firstSteps({ hasZoom: true, students: 0, classes: 0 })).toEqual({ done: [true, false, false], count: 1, current: 1 })
    expect(firstSteps({ hasZoom: false, students: 2, classes: 1 })).toEqual({ done: [false, true, true], count: 2, current: 0 })
    expect(firstSteps({ hasZoom: true, students: 1, classes: 3 }).current).toBe(-1)
  })
})

describe('minutesOf', () => {
  it('pasa HH:MM a minutos', () => { expect(minutesOf('18:30')).toBe(1110) })
})
