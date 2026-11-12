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
