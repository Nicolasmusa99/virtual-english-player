// Carpetas (2026-11): funciones PURAS (sin base; las usan las pantallas). Tests:
// tests/lib/folders.test.ts. La parte de base está en lib/folders.ts.

export const FOLDER_NAME_MAX = 60
export const FOLDER_NAME_ERROR = 'Escribí el nombre de la carpeta (hasta 60 letras).'
export const UNFILED_LABEL = 'Sin carpeta'

// El nombre que escribió alguien, limpio. Vacío o muy largo → null.
export function normalizeFolderName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.normalize('NFC').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
  return s && s.length <= FOLDER_NAME_MAX ? s : null
}

// Mover un elemento un lugar para arriba (-1) o para abajo (+1). Fuera de rango: igual.
export function moveInList<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list
  const out = [...list]
  ;[out[index], out[to]] = [out[to], out[index]]
  return out
}

// Agrupa lo que hay por carpeta, en el orden de las carpetas; lo que no tiene carpeta (o
// apunta a una que ya no existe) va al final, en "Sin carpeta". Las carpetas vacías quedan
// (salvo con `dropEmpty`: así el alumno no ve carpetas sin nada).
export type FolderRef = { id: string; name: string }
export function groupByFolder<T extends { folderId: string | null }>(
  items: T[], folderList: FolderRef[], opts: { dropEmpty?: boolean } = {}
): { folder: FolderRef | null; items: T[] }[] {
  const known = new Set(folderList.map((f) => f.id))
  const groups = folderList.map((folder) => ({ folder: folder as FolderRef | null, items: items.filter((i) => i.folderId === folder.id) }))
  const loose = items.filter((i) => !i.folderId || !known.has(i.folderId))
  const out = opts.dropEmpty ? groups.filter((g) => g.items.length > 0) : groups
  return loose.length > 0 ? [...out, { folder: null, items: loose }] : out
}

