// Calendario — una clase por franja del profe: funciones puras de lib/overlap.ts.
import { describe, it, expect } from 'vitest'
import { findClash, seriesSlotsToCheck, seriesTimingChanged, slotsOverlap, SERIES_CHECK_DAYS, type BusyClass } from '@/lib/overlap'

const at = (iso: string, durationMin = 60) => ({ startsAt: new Date(iso), durationMin })
const busy = (iso: string, durationMin = 60, status: BusyClass['status'] = 'scheduled', id = iso) =>
  ({ startsAt: new Date(iso), durationMin, status, id })

describe('slotsOverlap — [inicio, fin)', () => {
  it('solape total, una adentro de la otra, parcial al inicio y al fin', () => {
    expect(slotsOverlap(at('2026-10-20T21:00:00Z'), at('2026-10-20T21:00:00Z'))).toBe(true) // misma franja
    expect(slotsOverlap(at('2026-10-20T21:00:00Z', 120), at('2026-10-20T21:30:00Z', 30))).toBe(true) // adentro
    expect(slotsOverlap(at('2026-10-20T21:00:00Z'), at('2026-10-20T20:30:00Z'))).toBe(true) // la otra empieza antes
    expect(slotsOverlap(at('2026-10-20T21:00:00Z'), at('2026-10-20T21:45:00Z'))).toBe(true) // la otra empieza antes del fin
  })
  it('pegadas (una termina justo cuando empieza la otra) NO se cruzan; separadas tampoco', () => {
    expect(slotsOverlap(at('2026-10-20T21:00:00Z'), at('2026-10-20T22:00:00Z'))).toBe(false)
    expect(slotsOverlap(at('2026-10-20T21:00:00Z'), at('2026-10-20T20:00:00Z'))).toBe(false)
    expect(slotsOverlap(at('2026-10-20T21:00:00Z'), at('2026-10-21T21:00:00Z'))).toBe(false)
  })
})

describe('findClash', () => {
  const wanted = [at('2026-10-20T21:00:00Z')]
  it('devuelve la clase que choca', () => {
    const b = busy('2026-10-20T21:30:00Z')
    expect(findClash(wanted, [busy('2026-10-20T19:00:00Z'), b])?.busy).toBe(b)
  })
  it('una cancelada no ocupa', () => {
    expect(findClash(wanted, [busy('2026-10-20T21:00:00Z', 60, 'cancelled')])).toBeNull()
  })
  it('la clase que se edita no choca consigo misma', () => {
    const self = busy('2026-10-20T21:00:00Z', 60, 'scheduled', 'yo')
    expect(findClash(wanted, [self], (c) => c.id === 'yo')).toBeNull()
    expect(findClash(wanted, [self, busy('2026-10-20T21:15:00Z', 30, 'scheduled', 'otra')], (c) => c.id === 'yo')?.busy.id).toBe('otra')
  })
  it('sin nada pedido o sin clases, no hay choque', () => {
    expect(findClash([], [busy('2026-10-20T21:00:00Z')])).toBeNull()
    expect(findClash(wanted, [])).toBeNull()
  })
})

describe('seriesSlotsToCheck — las clases de un horario que se chequean (ventana acotada)', () => {
  const NOW = new Date('2026-10-16T15:00:00Z') // viernes 16/10 12:00 en Buenos Aires
  const TUE = { weekdays: [2], startMinute: 18 * 60, durationMin: 60, endsOn: null }
  it(`desde hoy hasta ${SERIES_CHECK_DAYS} días (las que ya pasaron no importan)`, () => {
    const slots = seriesSlotsToCheck({ ...TUE, startsOn: '2026-09-01' }, NOW)
    expect(slots[0].startsAt.toISOString()).toBe('2026-10-20T21:00:00.000Z') // el próximo martes
    expect(slots.length).toBe(13) // ~90 días de martes
    expect(slots.every((s) => s.durationMin === 60)).toBe(true)
  })
  it('si empieza más adelante, desde que empieza; si termina antes, hasta que termina', () => {
    const slots = seriesSlotsToCheck({ ...TUE, startsOn: '2026-11-01', endsOn: '2026-11-17' }, NOW)
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual(['2026-11-03T21:00:00.000Z', '2026-11-10T21:00:00.000Z', '2026-11-17T21:00:00.000Z'])
  })
})

describe('seriesTimingChanged — solo cambiar el link no cuenta', () => {
  const S = { weekdays: [2, 4], startMinute: 1080, durationMin: 60, startsOn: '2026-09-01', endsOn: null }
  it('días (en otro orden no), hora, duración, inicio y fin', () => {
    expect(seriesTimingChanged(S, { ...S })).toBe(false)
    expect(seriesTimingChanged(S, { ...S, weekdays: [4, 2] })).toBe(false)
    expect(seriesTimingChanged(S, { ...S, weekdays: [2] })).toBe(true)
    expect(seriesTimingChanged(S, { ...S, startMinute: 1140 })).toBe(true)
    expect(seriesTimingChanged(S, { ...S, durationMin: 90 })).toBe(true)
    expect(seriesTimingChanged(S, { ...S, startsOn: '2026-10-01' })).toBe(true)
    expect(seriesTimingChanged(S, { ...S, endsOn: '2026-12-15' })).toBe(true)
  })
})
