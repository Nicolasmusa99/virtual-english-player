// Material y carpetas (2026-11): funciones puras de lib/materialView.ts.
import { describe, it, expect } from 'vitest'
import { ALL, byNextClass, countLabel, destFor, isSameDayInTz, itemsIn, sameSel, validSel } from '@/lib/materialView'

const items = [
  { id: 'a', folderId: 'f1' }, { id: 'b', folderId: null }, { id: 'c', folderId: 'gone' }, { id: 'd', folderId: 'f2' },
]
const ids = ['f1', 'f2']

describe('materialView', () => {
  it('countLabel', () => {
    expect([0, 1, 4].map(countLabel)).toEqual(['Vacía', '1 video', '4 videos'])
  })
  it('itemsIn: todo, una carpeta y lo suelto (incluye carpetas que ya no existen)', () => {
    expect(itemsIn(items, ids, ALL).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(itemsIn(items, ids, { kind: 'folder', id: 'f2' }).map((i) => i.id)).toEqual(['d'])
    expect(itemsIn(items, ids, { kind: 'loose' }).map((i) => i.id)).toEqual(['b', 'c'])
  })
  it('validSel vuelve a "todo" si la carpeta desapareció; destFor', () => {
    expect(validSel({ kind: 'folder', id: 'x' }, ids)).toEqual(ALL)
    expect(validSel({ kind: 'folder', id: 'f1' }, ids)).toEqual({ kind: 'folder', id: 'f1' })
    expect(destFor({ kind: 'folder', id: 'f1' })).toBe('f1')
    expect(destFor(ALL)).toBe('')
    expect(sameSel({ kind: 'folder', id: 'f1' }, { kind: 'folder', id: 'f2' })).toBe(false)
    expect(sameSel({ kind: 'loose' }, { kind: 'loose' })).toBe(true)
  })
  it('byNextClass: primero la clase más cercana; sin clase al final, por nombre', () => {
    const people = [
      { name: 'Zoe', email: null, next: null }, { name: 'Ana', email: null, next: null },
      { name: 'Beto', email: null, next: '2026-10-07T10:00:00Z' }, { name: 'Ciro', email: null, next: '2026-10-06T10:00:00Z' },
    ]
    expect(byNextClass(people, (p) => p.next).map((p) => p.name)).toEqual(['Ciro', 'Beto', 'Ana', 'Zoe'])
  })
  it('isSameDayInTz usa el día de Argentina', () => {
    const now = new Date('2026-10-05T15:00:00Z') // 12:00 en BA
    expect(isSameDayInTz('2026-10-06T02:00:00Z', now, 'America/Argentina/Buenos_Aires')).toBe(true) // 23:00 del 5 en BA
    expect(isSameDayInTz('2026-10-06T03:30:00Z', now, 'America/Argentina/Buenos_Aires')).toBe(false)
  })
})
