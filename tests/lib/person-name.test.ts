// Nombre y apellido del alta (admin/profe) — normalizePersonName.
import { describe, it, expect } from 'vitest'
import { NAME_MAX, normalizePersonName } from '@/lib/personName'

describe('normalizePersonName', () => {
  it('saca espacios de más y respeta acentos y mayúsculas', () => {
    expect(normalizePersonName('  Martina   Pérez ')).toBe('Martina Pérez')
    expect(normalizePersonName('María José\tGonzález')).toBe('María José González')
    expect(normalizePersonName("Seán O'Brien")).toBe("Seán O'Brien")
  })
  it('rechaza lo que no es un nombre', () => {
    expect(normalizePersonName('')).toBeNull()
    expect(normalizePersonName('   ')).toBeNull()
    expect(normalizePersonName('A')).toBeNull()
    expect(normalizePersonName('1234')).toBeNull()
    expect(normalizePersonName('martina@gmail.com')).toBeNull()
    expect(normalizePersonName('<b>Ana</b>')).toBeNull()
    expect(normalizePersonName('a'.repeat(NAME_MAX + 1))).toBeNull()
    expect(normalizePersonName(null)).toBeNull()
    expect(normalizePersonName(42)).toBeNull()
  })
  it('acepta justo el máximo', () => {
    expect(normalizePersonName('a'.repeat(NAME_MAX))).toHaveLength(NAME_MAX)
  })
})
