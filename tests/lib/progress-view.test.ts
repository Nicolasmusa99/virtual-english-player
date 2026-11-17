import { describe, it, expect } from 'vitest'
import { lastSeenText, markLabel, parseProgressBody, progressPctOf, progressText, shouldSaveProgress } from '@/lib/progressView'

const NOW = new Date('2026-11-12T18:00:00Z') // 15:00 en Buenos Aires

describe('progressView', () => {
  it('parseProgressBody valida y redondea', () => {
    expect(parseProgressBody({ position: 12.345 })).toBe(12.3)
    expect(parseProgressBody({ position: -1 })).toBeNull()
    expect(parseProgressBody({ position: Infinity })).toBeNull()
    expect(parseProgressBody({ position: '3' })).toBeNull()
    expect(parseProgressBody(null)).toBeNull()
  })
  it('shouldSaveProgress: no en 0 ni si casi no se movió', () => {
    expect(shouldSaveProgress(0, null)).toBe(false)
    expect(shouldSaveProgress(5, null)).toBe(true)
    expect(shouldSaveProgress(5.4, 5)).toBe(false)
    expect(shouldSaveProgress(7, 5)).toBe(true)
  })
  it('progressText', () => {
    expect(progressText(754, 1210)).toBe('Quedó en 12:34 de 20:10')
    expect(progressText(754, null)).toBe('Quedó en 12:34')
    expect(progressText(1208, 1210)).toBe('Lo vio entero')
    expect(progressPctOf(605, 1210)).toBe(50)
    expect(progressPctOf(605, null)).toBeNull()
  })
  it('lastSeenText en la hora de Buenos Aires', () => {
    expect(lastSeenText('2026-11-12T12:00:00Z', NOW)).toBe('hoy')
    expect(lastSeenText('2026-11-12T02:00:00Z', NOW)).toBe('ayer') // 23:00 del 11 en BA
    expect(lastSeenText('2026-11-09T15:00:00Z', NOW)).toBe('hace 3 días')
    expect(lastSeenText('2026-11-01T15:00:00Z', NOW)).toBe('el 1/11')
  })
  it('markLabel: primer nombre o el mail antes de la @', () => {
    expect(markLabel('Juan Pérez', 'j@x.com')).toBe('Juan')
    expect(markLabel(null, 'maria.g@x.com')).toBe('maria.g')
    expect(markLabel('', null)).toBe('Alumno')
  })
})

import { classText, ownText, classMarkText, ownMarkText, parseClassProgressBody, currentClassStudent } from '@/lib/progressView'

describe('progressView — avance en clase', () => {
  const S = 'aaaaaaaa-0000-4000-8000-00000000000a'
  it('textos de clase y por su cuenta', () => {
    expect(classText(754, 1210)).toBe('Quedaron en 12:34 de 20:10')
    expect(classText(1209, 1210)).toBe('Lo terminaron')
    expect(ownText(310, 1210)).toBe('Por su cuenta lo vio hasta 5:10')
    expect(ownText(1209, 1210)).toBe('Por su cuenta lo vio entero')
    const m = { studentId: S, name: 'Juan', positionSec: 754, seenAt: '2026-11-10T15:00:00Z' }
    expect(classMarkText(m, NOW)).toBe('Con Juan quedaron en 12:34, hace 2 días')
    expect(ownMarkText(m, NOW)).toBe('Juan lo vio por su cuenta hasta 12:34, hace 2 días')
  })
  it('parseClassProgressBody', () => {
    expect(parseClassProgressBody({ studentId: S, position: 12.34 })).toEqual({ studentId: S, position: 12.3 })
    expect(parseClassProgressBody({ studentId: 'x', position: 3 })).toBeNull()
    expect(parseClassProgressBody({ studentId: S })).toBeNull()
  })
  it('currentClassStudent: la clase en curso, con margen, sin canceladas', () => {
    const at = (iso: string, studentId: string, status = 'scheduled') => ({ studentId, startsAt: iso, durationMin: 60, status })
    const now = new Date('2026-11-12T18:20:00Z')
    expect(currentClassStudent([at('2026-11-12T18:00:00Z', 'a')], now)).toBe('a')
    expect(currentClassStudent([at('2026-11-12T18:30:00Z', 'b')], now)).toBe('b') // empieza en 10 min
    expect(currentClassStudent([at('2026-11-12T17:00:00Z', 'c')], now)).toBeNull() // terminó hace 20 min
    expect(currentClassStudent([at('2026-11-12T18:00:00Z', 'a', 'cancelled')], now)).toBeNull()
    expect(currentClassStudent([at('2026-11-12T17:30:00Z', 'x'), at('2026-11-12T18:15:00Z', 'y')], now)).toBe('y')
  })
})
