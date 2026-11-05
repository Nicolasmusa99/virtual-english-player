// Material y carpetas en pantalla (2026-11): funciones PURAS (sin base). Tests:
// tests/lib/material-view.test.ts.

export const TIPO_LABEL = { pelicula: 'Película', cancion: 'Canción' } as const
export const NIVEL_LABEL = { beginner: 'Beginner', medium: 'Medium', advance: 'Advance' } as const

// '1 video' / '3 videos' / 'Vacía'
export const countLabel = (n: number) => (n === 0 ? 'Vacía' : n === 1 ? '1 video' : `${n} videos`)

// Qué carpeta se está mirando en el material de un alumno: todo, una carpeta o lo suelto.
export type FolderSel = { kind: 'all' } | { kind: 'loose' } | { kind: 'folder'; id: string }
export const ALL: FolderSel = { kind: 'all' }
export const sameSel = (a: FolderSel, b: FolderSel) =>
  a.kind === b.kind && (a.kind !== 'folder' || (b.kind === 'folder' && a.id === b.id))

// Lo que se ve con esa selección. Un video que apunta a una carpeta que ya no existe cuenta
// como suelto (igual que en groupByFolder).
export function itemsIn<T extends { folderId: string | null }>(items: T[], folderIds: string[], sel: FolderSel): T[] {
  if (sel.kind === 'all') return items
  const known = new Set(folderIds)
  if (sel.kind === 'loose') return items.filter((i) => !i.folderId || !known.has(i.folderId))
  return items.filter((i) => i.folderId === sel.id)
}

// Si la carpeta elegida desaparece (la borraron), se vuelve a "Todo el material".
export function validSel(sel: FolderSel, folderIds: string[]): FolderSel {
  return sel.kind === 'folder' && !folderIds.includes(sel.id) ? ALL : sel
}

// Dónde se asigna lo nuevo: en la carpeta que se está mirando (si es una carpeta).
export const destFor = (sel: FolderSel): string => (sel.kind === 'folder' ? sel.id : '')

// Ordena personas por su próxima clase (las que no tienen van al final, por nombre).
export function byNextClass<T extends { name: string | null; email: string | null }>(
  list: T[], nextOf: (u: T) => string | null
): T[] {
  const key = (u: T) => (u.name || u.email || '').toLocaleLowerCase('es')
  return [...list].sort((a, b) => {
    const na = nextOf(a), nb = nextOf(b)
    if (na && nb) return na.localeCompare(nb) || key(a).localeCompare(key(b), 'es')
    if (na) return -1
    if (nb) return 1
    return key(a).localeCompare(key(b), 'es')
  })
}

// "Hoy" en la hora de Argentina: la próxima clase de hoy se marca (el amarillo del "ahora").
export function isSameDayInTz(iso: string, now: Date, tz: string): boolean {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  return f.format(new Date(iso)) === f.format(now)
}
