// 2026-11 — funciones puras de carpetas (lib/folderView.ts) y de personas (lib/peopleView.ts).
import { describe, it, expect } from 'vitest'
import { FOLDER_NAME_MAX, groupByFolder, moveInList, normalizeFolderName } from '@/lib/folderView'
import {
  avatarColor, AVATAR_COLORS, deleteConsequences, foldersLabel, initials, nextClassByStudent, nextClassText, sortPeople,
  studentsLabel, videosLabel,
} from '@/lib/peopleView'

describe('carpetas', () => {
  it('normalizeFolderName: limpia espacios; vacío, muy largo o no texto → null', () => {
    expect(normalizeFolderName('  Unidad   1 ')).toBe('Unidad 1')
    for (const x of ['', '   ', 'x'.repeat(FOLDER_NAME_MAX + 1), null, 3]) expect(normalizeFolderName(x)).toBeNull()
  })
  it('moveInList: sube y baja un lugar; en los bordes queda igual', () => {
    expect(moveInList(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveInList(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveInList(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moveInList(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
  })
  it('groupByFolder: en el orden de las carpetas; lo suelto (o de una carpeta que ya no está) al final', () => {
    const folders = [{ id: 'f2', name: 'Dos' }, { id: 'f1', name: 'Uno' }, { id: 'f3', name: 'Vacía' }]
    const items = [{ id: 'a', folderId: 'f1' }, { id: 'b', folderId: null }, { id: 'c', folderId: 'f2' }, { id: 'd', folderId: 'borrada' }]
    const g = groupByFolder(items, folders)
    expect(g.map((x) => [x.folder?.name ?? null, x.items.map((i) => i.id)])).toEqual([
      ['Dos', ['c']], ['Uno', ['a']], ['Vacía', []], [null, ['b', 'd']],
    ])
    expect(groupByFolder(items, folders, { dropEmpty: true }).map((x) => x.folder?.name ?? null)).toEqual(['Dos', 'Uno', null])
    expect(groupByFolder([{ id: 'a', folderId: 'f1' }], folders, { dropEmpty: true }).map((x) => x.folder?.name)).toEqual(['Uno'])
  })
})

describe('personas', () => {
  it('initials', () => {
    expect(initials('Martina Pérez')).toBe('MP')
    expect(initials('  ana  maría  gómez ')).toBe('AG')
    expect(initials('Laura')).toBe('L')
    expect(initials(null, 'lucia@x.com')).toBe('L')
    expect(initials(null, null)).toBe('?')
  })
  it('avatarColor: fijo por persona y dentro de la paleta', () => {
    expect(avatarColor('al-1')).toBe(avatarColor('al-1'))
    for (const id of ['a', 'b', 'xyz', '00000000-0000-4000-8000-000000000001']) {
      expect(avatarColor(id)).toBeGreaterThanOrEqual(0)
      expect(avatarColor(id)).toBeLessThan(AVATAR_COLORS)
    }
  })
  it('sortPeople: profes, alumnos y admins; adentro por nombre', () => {
    const list = [
      { name: 'Zoe', email: 'z@x', role: 'alumno' as const },
      { name: null, email: 'admin@x', role: 'admin' as const },
      { name: 'Ana', email: 'a@x', role: 'alumno' as const },
      { name: 'Laura', email: 'l@x', role: 'profesor' as const },
    ]
    expect(sortPeople(list).map((p) => p.name ?? p.email)).toEqual(['Laura', 'Ana', 'Zoe', 'admin@x'])
  })
  it('etiquetas', () => {
    expect([0, 1, 3].map(videosLabel)).toEqual(['Sin material', '1 video', '3 videos'])
    expect([0, 1, 4].map(studentsLabel)).toEqual(['Sin alumnos', '1 alumno', '4 alumnos'])
    expect([0, 1, 2].map(foldersLabel)).toEqual([null, '1 carpeta', '2 carpetas'])
  })
  it('deleteConsequences: alumno y profe (con o sin alumnos), sin guiones largos', () => {
    expect(deleteConsequences('alumno')[0]).toMatch(/material asignado, sus carpetas y sus clases/)
    expect(deleteConsequences('profesor', 3).join(' ')).toMatch(/3 alumnos quedan sin profe/)
    expect(deleteConsequences('profesor', 1).join(' ')).toMatch(/1 alumno queda sin profe/)
    expect(deleteConsequences('profesor', 0).join(' ')).toMatch(/No tiene alumnos/)
    for (const r of ['alumno', 'profesor'] as const) for (const t of deleteConsequences(r, 2)) expect(t).not.toMatch(/[—–]/)
  })
  it('nextClassByStudent: la primera programada que no terminó, por alumno', () => {
    const now = new Date('2026-10-05T15:00:00Z')
    const c = (studentId: string, iso: string, status: 'scheduled' | 'cancelled' = 'scheduled') => ({ studentId, startsAt: new Date(iso), durationMin: 60, status })
    const out = nextClassByStudent([
      c('a', '2026-10-08T21:00:00Z'), c('a', '2026-10-06T21:00:00Z'), c('a', '2026-10-05T10:00:00Z'),
      c('b', '2026-10-05T14:30:00Z'), // en curso: cuenta
      c('c', '2026-10-07T21:00:00Z', 'cancelled'),
    ], now)
    expect(out.get('a')?.toISOString()).toBe('2026-10-06T21:00:00.000Z')
    expect(out.get('b')?.toISOString()).toBe('2026-10-05T14:30:00.000Z')
    expect(out.has('c')).toBe(false)
  })
  it('nextClassText: hoy / mañana / la fecha, en hora de Argentina', () => {
    const now = new Date('2026-10-05T15:00:00Z')
    expect(nextClassText('2026-10-05T21:00:00Z', now)).toBe('Hoy, 18:00')
    expect(nextClassText('2026-10-06T21:00:00Z', now)).toBe('Mañana, 18:00')
    expect(nextClassText('2026-10-08T13:30:00Z', now)).toBe('Jueves 8 de octubre, 10:30')
  })
})
