'use client'
// Las bibliotecas, a lo Drive (rediseño 2026-11-05). Un solo componente para las dos pantallas,
// así se ven y se usan igual:
//   · mode="shared": la Biblioteca compartida (solo lo publicado; la ven admin y profes).
//   · mode="mine":   Mi biblioteca (los videos que subió quien mira, publicados o no).
// A la izquierda: "Todos los videos" (y en Mi biblioteca, "Publicados" y "Privados"), las
// carpetas y "Sin carpeta". A la derecha, lo que hay en la elegida: buscador, filtros de tipo
// y nivel, y tarjetas.
// El ADMIN (canManage) arma las carpetas ahí mismo (crear, renombrar, ordenar, eliminar),
// tilda varios videos y los agrega o saca de una carpeta de una vez (con "Deshacer"), o los
// arrastra a una carpeta. En Mi biblioteca además publica, despublica, edita tipo y nivel,
// renombra y elimina, de a uno (menú "⋯") o varios juntos.
// Las carpetas son las de la biblioteca (/api/folders): las mismas en las dos pantallas. Un
// video puede estar en varias. El servidor decide quién puede qué.
import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import styles from './material.module.css'
import sl from './shared.module.css'
import cd from './classes.module.css'
import type { SharedType, SharedLevel } from '@/lib/db/schema'
import AssignToStudents from './AssignToStudents'
import ActionMenu, { type MenuItem } from './ActionMenu'
import VideoNameDialog from './VideoNameDialog'
import { FolderGlyph, PlayIcon } from './MaterialPicker'
import { Modal } from './ClassDialog'
import { FOLDER_NAME_ERROR, FOLDER_NAME_MAX, normalizeFolderName } from '@/lib/folderView'
import { NIVEL_LABEL, TIPO_LABEL, countLabel } from '@/lib/materialView'

export interface BrowserVideo {
  id: string
  originalName: string
  sharedType: SharedType | null
  sharedLevel: SharedLevel | null
  publishedAt: string | null
  phraseCount: number
  status?: string
  ownerName?: string | null
}
// Lo que trae /api/videos para "Mi biblioteca".
export interface LibraryVideoRow extends BrowserVideo { status: string }
type LibFolder = { id: string; name: string; videoIds: string[] }
type Sel = { kind: 'all' } | { kind: 'pub' } | { kind: 'priv' } | { kind: 'loose' } | { kind: 'folder'; id: string }

export const SHARED_TEXTS = {
  all: 'Todos los videos', pub: 'Publicados', priv: 'Privados', loose: 'Sin carpeta', folders: 'Carpetas',
  newFolder: 'Nueva carpeta', folderName: 'Nombre de la carpeta', create: 'Crear', cancel: 'Cancelar', save: 'Guardar',
  search: 'Buscar en la biblioteca', type: 'Tipo', level: 'Nivel', allChip: 'Todos',
  open: 'Abrir', assign: 'Asignar a alumnos', upload: '+ Subir video',
  phrases: (n: number) => `${n} frases`,
  select: (n: string) => `Seleccionar ${n}`,
  selectAll: 'Seleccionar todos',
  selected: (n: number) => (n === 1 ? '1 seleccionado' : `${n} seleccionados`),
  clear: 'Cancelar selección',
  addTo: 'Agregar a carpeta…',
  addToNew: 'Nueva carpeta…',
  takeOut: (n: number) => (n === 1 ? 'Sacar de la carpeta' : `Sacar ${n} de la carpeta`),
  added: (n: number, f: string) => `${n === 1 ? 'Se agregó 1 video' : `Se agregaron ${n} videos`} a ${f}.`,
  already: (f: string) => `Ya estaban todos en ${f}.`,
  takenOut: (n: number, f: string) => `${n === 1 ? 'Se sacó 1 video' : `Se sacaron ${n} videos`} de ${f}.`,
  undo: 'Deshacer',
  folderMore: (n: string) => `Opciones de la carpeta ${n}`,
  more: (n: string) => `Más acciones de ${n}`,
  rename: 'Renombrar', up: 'Subir', down: 'Bajar', remove: 'Eliminar carpeta',
  removeTitle: (n: string) => `Eliminar la carpeta "${n}"`,
  removeNote: 'Los videos no se borran: solo dejan de estar en esta carpeta.',
  dragHint: 'Tildá varios o arrastralos a una carpeta para ordenarlos.',
  readOnly: 'El material compartido es solo lectura: si editás las captions de un video, se guarda tu propia copia y el original queda intacto.',
  empty: 'Todavía no hay material disponible. El administrador publica acá los videos para las clases.',
  emptyMine: 'Todavía no guardaste ningún video.',
  emptyFolder: 'Esta carpeta está vacía.',
  emptyFolderAdmin: 'Andá a "Todos los videos", tildá los que quieras y agregalos a esta carpeta, o arrastralos hasta acá.',
  emptyLoose: 'Todos los videos están en alguna carpeta.',
  emptyView: 'No hay videos acá.',
  noResults: 'No hay videos con esa búsqueda o esos filtros.',
  loadError: 'No se pudo cargar la biblioteca.', retry: 'Reintentar',
  // Mi biblioteca
  published: 'Publicado', private: 'Privado', expired: 'Expirado',
  publish: 'Publicar…', editMeta: 'Editar tipo y nivel', unpublish: 'Despublicar', renameVideo: 'Cambiar nombre', delete: 'Eliminar',
  publishMany: (n: number) => (n === 1 ? 'Publicar…' : `Publicar ${n}…`),
  unpublishMany: (n: number) => (n === 1 ? 'Despublicar' : `Despublicar ${n}`),
  deleteMany: (n: number) => (n === 1 ? 'Eliminar' : `Eliminar ${n}`),
  publishTitle: (n: number, name?: string) => (n === 1 && name ? `Publicar "${name}"` : `Publicar ${n} videos`),
  editTitle: (name: string) => `Tipo y nivel de "${name}"`,
  publishNote: 'Queda en la biblioteca compartida: los profes lo ven y se lo pueden asignar a sus alumnos.',
  publishNeed: 'Elegí tipo y nivel.',
  publishDo: 'Publicar',
  publishedOk: (n: number) => (n === 1 ? 'Se publicó 1 video.' : `Se publicaron ${n} videos.`),
  unpublishedOk: (n: number) => (n === 1 ? 'Se despublicó 1 video.' : `Se despublicaron ${n} videos.`),
  deleteTitle: (n: number, name?: string) => (n === 1 && name ? `Eliminar "${name}"` : `Eliminar ${n} videos`),
  deleteNote: 'Se borra el video y sus subtítulos. No se puede deshacer.',
  deletePubNote: (n: number, total: number) => (total === 1
    ? 'Está publicado: si lo eliminás, se lo sacás a los profes que lo usan. Si solo querés sacarlo de la compartida, despublicalo.'
    : `${n === 1 ? '1 de ellos está publicado' : `${n} de ellos están publicados`}: si los eliminás, se los sacás a los profes que los usan. Si solo querés sacarlos de la compartida, despublicalos.`),
  deleteDo: 'Eliminar', unpublishInstead: 'Despublicar en vez de eliminar',
  deletedOk: (n: number) => (n === 1 ? 'Se eliminó 1 video.' : `Se eliminaron ${n} videos.`),
} as const

const DRAG_TYPE = 'application/x-ve-library'

export default function LibraryBrowser({
  mode, videos: videosProp, onOpen, assignable = false, canManage = false, onChanged, onDelete, onUpload, toolbar,
}: {
  mode: 'shared' | 'mine'
  /** mode="mine": los videos los trae la página (fetchLibrary). */
  videos?: BrowserVideo[]
  onOpen: (id: string) => void
  assignable?: boolean
  /** El admin: carpetas y (en Mi biblioteca) publicar/editar/eliminar. */
  canManage?: boolean
  /** mode="mine": algo cambió en el servidor (publicar, renombrar): volver a traer. */
  onChanged?: () => void
  /** mode="mine": borrar un video (lo hace la página). */
  onDelete?: (id: string) => Promise<void> | void
  /** mode="mine": botón "+ Subir video" arriba a la derecha. */
  onUpload?: () => void
  toolbar?: ReactNode
}) {
  const T = SHARED_TEXTS
  const mine = mode === 'mine'
  const [fetched, setFetched] = useState<BrowserVideo[]>([])
  const videos = mine ? videosProp ?? [] : fetched
  const [folders, setFolders] = useState<LibFolder[]>([])
  const [loading, setLoading] = useState(!mine)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [sel, setSel] = useState<Sel>({ kind: 'all' })
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState<'all' | SharedType>('all')
  const [nivel, setNivel] = useState<'all' | SharedLevel>('all')
  const [picked, setPicked] = useState<string[]>([])
  const [assignTarget, setAssignTarget] = useState<{ id: string; name: string } | null>(null)
  const [creating, setCreating] = useState<null | { thenAdd: string[] }>(null)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dropOn, setDropOn] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null)
  // Mi biblioteca
  const [publishing, setPublishing] = useState<null | { ids: string[]; edit: boolean }>(null)
  const [deleting, setDeleting] = useState<string[] | null>(null)
  const [renamingVideo, setRenamingVideo] = useState<BrowserVideo | null>(null)

  const loadFolders = useCallback(async (): Promise<LibFolder[]> => {
    if (mine && !canManage) return [] // el profe no tiene carpetas en sus videos
    try {
      const res = await fetch('/api/folders')
      if (!res.ok) return []
      const list: LibFolder[] = (await res.json()).folders ?? []
      setFolders(list)
      return list
    } catch { return [] }
  }, [mine, canManage])
  const load = useCallback(async () => {
    if (!mine) {
      setLoading(true); setLoadError('')
      try {
        const res = await fetch('/api/shared-videos')
        if (!res.ok) throw new Error()
        setFetched((await res.json()).videos ?? [])
      } catch { setLoadError(T.loadError) }
      finally { setLoading(false) }
    }
    await loadFolders()
  }, [mine, loadFolders, T.loadError])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 7000)
    return () => clearTimeout(t)
  }, [toast])

  async function send(url: string, method: string, body?: unknown): Promise<string | null> {
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      if (res.ok) return null
      const data = await res.json().catch(() => null)
      return typeof data?.error === 'string' ? data.error : 'No se pudo guardar.'
    } catch { return 'No se pudo guardar.' }
  }

  const byId = useMemo(() => new Map(videos.map((v) => [v.id, v])), [videos])
  const inFolder = (f: LibFolder) => f.videoIds.filter((id) => byId.has(id))
  const inSome = useMemo(() => new Set(folders.flatMap((f) => f.videoIds)), [folders])
  const current: Sel = sel.kind === 'folder' && !folders.some((f) => f.id === sel.id) ? { kind: 'all' } : sel
  const folder = current.kind === 'folder' ? folders.find((f) => f.id === current.id) ?? null : null
  const fIndex = folder ? folders.findIndex((f) => f.id === folder.id) : -1

  const inSel = useMemo(() => {
    switch (current.kind) {
      case 'all': return videos
      case 'pub': return videos.filter((v) => v.publishedAt)
      case 'priv': return videos.filter((v) => !v.publishedAt)
      case 'loose': return videos.filter((v) => !inSome.has(v.id))
      case 'folder': { const ids = new Set(folder?.videoIds ?? []); return videos.filter((v) => ids.has(v.id)) }
    }
  }, [current, videos, inSome, folder])
  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('es')
    return inSel.filter((v) => (!needle || v.originalName.toLocaleLowerCase('es').includes(needle)) &&
      (tipo === 'all' || v.sharedType === tipo) && (nivel === 'all' || v.sharedLevel === nivel))
  }, [inSel, q, tipo, nivel])
  const pickedVisible = picked.filter((id) => visible.some((v) => v.id === id))
  const pickedRows = pickedVisible.map((id) => byId.get(id)!).filter(Boolean)
  const title = current.kind === 'all' ? T.all : current.kind === 'pub' ? T.pub : current.kind === 'priv' ? T.priv
    : current.kind === 'loose' ? T.loose : folder?.name ?? ''

  function go(s: Sel) { setSel(s); setPicked([]); setRenaming(false); setError('') }

  // ── carpetas ──
  async function createFolder() {
    const name = normalizeFolderName(newName)
    if (!name) { setError(FOLDER_NAME_ERROR); return }
    const thenAdd = creating?.thenAdd ?? []
    const e = await send('/api/folders', 'POST', { name })
    if (e) { setError(e); return }
    const before = new Set(folders.map((f) => f.id))
    setCreating(null); setNewName(''); setError('')
    const fresh = (await loadFolders()).find((f) => !before.has(f.id))
    if (fresh && thenAdd.length) await addTo(fresh, thenAdd)
    if (fresh) go({ kind: 'folder', id: fresh.id })
  }
  async function renameFolder() {
    if (!folder) return
    const name = normalizeFolderName(renameValue)
    if (!name) { setError(FOLDER_NAME_ERROR); return }
    if (name !== folder.name) {
      const e = await send(`/api/folders/${folder.id}`, 'PATCH', { name })
      if (e) { setError(e); return }
      setFolders((l) => l.map((f) => (f.id === folder.id ? { ...f, name } : f)))
    }
    setRenaming(false); setError('')
  }
  async function moveFolder(dir: 'up' | 'down') {
    if (!folder) return
    const e = await send(`/api/folders/${folder.id}`, 'PATCH', { move: dir })
    if (e) setError(e)
    loadFolders()
  }
  async function deleteFolder() {
    if (!folder) return
    setBusy(true)
    const e = await send(`/api/folders/${folder.id}`, 'DELETE')
    setBusy(false); setConfirmDel(false)
    if (e) { setError(e); return }
    go({ kind: 'all' }); loadFolders()
  }

  // ── videos en carpetas ──
  async function addTo(f: LibFolder, ids: string[]) {
    const toAdd = ids.filter((id) => !f.videoIds.includes(id))
    setPicked([])
    if (toAdd.length === 0) { setToast({ text: T.already(f.name) }); return }
    setFolders((l) => l.map((x) => (x.id === f.id ? { ...x, videoIds: [...x.videoIds, ...toAdd] } : x)))
    const errs = await Promise.all(toAdd.map((videoId) => send(`/api/folders/${f.id}/videos`, 'POST', { videoId })))
    if (errs.some(Boolean)) { setError(errs.find(Boolean)!); loadFolders(); return }
    setToast({
      text: T.added(toAdd.length, f.name),
      undo: async () => {
        setToast(null)
        setFolders((l) => l.map((x) => (x.id === f.id ? { ...x, videoIds: x.videoIds.filter((v) => !toAdd.includes(v)) } : x)))
        await Promise.all(toAdd.map((videoId) => send(`/api/folders/${f.id}/videos`, 'DELETE', { videoId })))
        loadFolders()
      },
    })
  }
  async function takeOut(f: LibFolder, ids: string[]) {
    const toTake = ids.filter((id) => f.videoIds.includes(id))
    if (toTake.length === 0) return
    setPicked([])
    setFolders((l) => l.map((x) => (x.id === f.id ? { ...x, videoIds: x.videoIds.filter((v) => !toTake.includes(v)) } : x)))
    const errs = await Promise.all(toTake.map((videoId) => send(`/api/folders/${f.id}/videos`, 'DELETE', { videoId })))
    if (errs.some(Boolean)) { setError(errs.find(Boolean)!); loadFolders(); return }
    setToast({
      text: T.takenOut(toTake.length, f.name),
      undo: async () => {
        setToast(null)
        setFolders((l) => l.map((x) => (x.id === f.id ? { ...x, videoIds: [...x.videoIds, ...toTake] } : x)))
        await Promise.all(toTake.map((videoId) => send(`/api/folders/${f.id}/videos`, 'POST', { videoId })))
        loadFolders()
      },
    })
  }
  const addMenu = (ids: string[]): MenuItem[] => [
    ...folders.map((f) => ({ label: f.name, onSelect: () => addTo(f, ids) })),
    ...(folders.length ? [{ kind: 'sep' as const }] : []),
    { label: T.addToNew, onSelect: () => { setCreating({ thenAdd: ids }); setNewName('') } },
  ]

  // ── Mi biblioteca: publicar, despublicar, eliminar ──
  async function unpublish(ids: string[]) {
    const pub = ids.filter((id) => byId.get(id)?.publishedAt)
    if (!pub.length) return
    setPicked([]); setError('')
    const errs = await Promise.all(pub.map((id) => send(`/api/videos/${id}/share`, 'DELETE')))
    if (errs.some(Boolean)) setError('No se pudo despublicar.')
    else setToast({ text: T.unpublishedOk(pub.length) })
    onChanged?.()
  }
  async function doDelete(ids: string[]) {
    setDeleting(null); setPicked([]); setError('')
    for (const id of ids) await onDelete?.(id)
    setToast({ text: T.deletedOk(ids.length) })
    loadFolders()
  }

  // ── arrastrar ──
  function onDragStart(e: DragEvent, id: string) {
    const ids = picked.includes(id) ? picked : [id]
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids))
    e.dataTransfer.setData('text/plain', ids.join(','))
    e.dataTransfer.effectAllowed = 'copy'
  }
  const dropProps = (f: LibFolder) => !canManage ? {} : {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
      if (dropOn !== f.id) setDropOn(f.id)
    },
    onDragLeave: () => setDropOn((d) => (d === f.id ? null : d)),
    onDrop: (e: DragEvent) => {
      e.preventDefault(); setDropOn(null)
      try { addTo(f, JSON.parse(e.dataTransfer.getData(DRAG_TYPE))) } catch { /* nada */ }
    },
  }

  const sameSel = (a: Sel, b: Sel) => a.kind === b.kind && (a.kind !== 'folder' || (b.kind === 'folder' && a.id === b.id))
  const navBtn = (key: string, s: Sel, label: string, count: number, icon: 'all' | 'folder' | 'soft' | 'pub' | 'priv', f?: LibFolder) => {
    const on = sameSel(current, s)
    return (
      <li key={key}>
        <button type="button" aria-current={on ? 'true' : undefined}
          className={`${styles.navItem} ${on ? styles.navOn : ''} ${f && dropOn === f.id ? styles.navDrop : ''}`}
          onClick={() => go(s)} {...(f ? dropProps(f) : {})}>
          {icon === 'all'
            ? <svg className={styles.navIco} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></svg>
            : icon === 'pub'
              ? <svg className={styles.navIco} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
              : icon === 'priv'
                ? <svg className={`${styles.navIco} ${styles.navIcoSoft}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                : <FolderGlyph className={`${styles.navIco} ${icon === 'soft' ? styles.navIcoSoft : ''}`} />}
          <span className={styles.navName}>{label}</span>
          <span className={styles.navCount}>{count}</span>
        </button>
      </li>
    )
  }

  const createForm = (
    <div className={styles.newFolder}>
      <input className={styles.input} autoFocus placeholder={T.folderName} aria-label={T.folderName} maxLength={FOLDER_NAME_MAX}
        value={newName} onChange={(e) => { setNewName(e.target.value); setError('') }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createFolder() } if (e.key === 'Escape') setCreating(null) }} />
      <div className={styles.rowBtns}>
        <button type="button" className={`${styles.btn} ${styles.btnSm} ${styles.btnPri}`} onClick={createFolder}>{T.create}</button>
        <button type="button" className={`${styles.btn} ${styles.btnSm}`} onClick={() => setCreating(null)}>{T.cancel}</button>
      </div>
    </div>
  )

  if (loading) return <p className={styles.muted}>Cargando material…</p>
  if (loadError) return <div className={styles.err} role="alert">{loadError} <button type="button" className={styles.linkBtn} onClick={load}>{T.retry}</button></div>
  if (videos.length === 0) {
    return (
      <div className={styles.emptyCard} style={{ margin: 0 }}>
        <span className={styles.emptyIco} aria-hidden="true"><PlayIcon /></span>
        <p className={styles.muted}>{mine ? T.emptyMine : T.empty}</p>
        {onUpload && <div className={styles.emptyBtns}><button type="button" className={`${styles.btn} ${styles.btnPri}`} onClick={onUpload}>{T.upload}</button></div>}
      </div>
    )
  }

  const looseCount = videos.filter((v) => !inSome.has(v.id)).length
  const pubCount = videos.filter((v) => v.publishedAt).length
  const showNav = canManage || folders.length > 0
  const manageVideos = mine && canManage

  const cardMenu = (v: BrowserVideo): MenuItem[] => {
    const items: MenuItem[] = [{ label: T.open, disabled: v.status === 'expired', onSelect: () => onOpen(v.id) }]
    if (assignable && v.publishedAt) items.push({ label: T.assign, onSelect: () => setAssignTarget({ id: v.id, name: v.originalName }) })
    if (manageVideos) {
      items.push({ label: T.renameVideo, onSelect: () => setRenamingVideo(v) })
      items.push(v.publishedAt
        ? { label: T.editMeta, onSelect: () => setPublishing({ ids: [v.id], edit: true }) }
        : { label: T.publish, disabled: v.status === 'expired', onSelect: () => setPublishing({ ids: [v.id], edit: false }) })
      if (v.publishedAt) items.push({ label: T.unpublish, onSelect: () => unpublish([v.id]) })
    }
    if (canManage) items.push({ kind: 'sep' }, { kind: 'title', label: 'Agregar a carpeta' }, ...addMenu([v.id]))
    if (canManage && folder) items.push({ kind: 'sep' }, { label: T.takeOut(1), onSelect: () => takeOut(folder, [v.id]) })
    if (mine && onDelete) items.push({ kind: 'sep' }, { label: T.delete, danger: true, onSelect: () => setDeleting([v.id]) })
    return items
  }

  return (
    <div className={showNav ? styles.layout : undefined}>
      {showNav && (
        <nav className={styles.nav} aria-label={T.folders}>
          <ul className={styles.navList}>
            {navBtn('all', { kind: 'all' }, T.all, videos.length, 'all')}
            {manageVideos && navBtn('pub', { kind: 'pub' }, T.pub, pubCount, 'pub')}
            {manageVideos && navBtn('priv', { kind: 'priv' }, T.priv, videos.length - pubCount, 'priv')}
          </ul>
          <div className={styles.navHead}>{T.folders}</div>
          <ul className={styles.navList}>
            {folders.map((f) => navBtn(f.id, { kind: 'folder', id: f.id }, f.name, inFolder(f).length, 'folder', f))}
            {navBtn('loose', { kind: 'loose' }, T.loose, looseCount, 'soft')}
          </ul>
          {canManage && (creating ? createForm : (
            <button type="button" className={styles.navAdd} onClick={() => { setCreating({ thenAdd: [] }); setNewName('') }}>+ {T.newFolder}</button>
          ))}
        </nav>
      )}

      <section className={styles.pane} aria-label={title}>
        <div className={styles.paneHead}>
          {renaming && folder ? (
            <div className={styles.renameRow}>
              <input className={styles.input} autoFocus aria-label={T.folderName} maxLength={FOLDER_NAME_MAX} value={renameValue}
                onChange={(e) => { setRenameValue(e.target.value); setError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); renameFolder() } if (e.key === 'Escape') setRenaming(false) }} />
              <button type="button" className={`${styles.btn} ${styles.btnPri}`} onClick={renameFolder}>{T.save}</button>
              <button type="button" className={styles.btn} onClick={() => setRenaming(false)}>{T.cancel}</button>
            </div>
          ) : (
            <>
              <h2 className={styles.paneTitle}>{title}<span className={styles.paneCount}>{countLabel(inSel.length)}</span></h2>
              {canManage && folder && (
                <ActionMenu label={T.folderMore(folder.name)} items={[
                  { label: T.rename, onSelect: () => { setRenameValue(folder.name); setRenaming(true) } },
                  { label: T.up, disabled: fIndex <= 0, onSelect: () => moveFolder('up') },
                  { label: T.down, disabled: fIndex >= folders.length - 1, onSelect: () => moveFolder('down') },
                  { kind: 'sep' },
                  { label: T.remove, danger: true, onSelect: () => setConfirmDel(true) },
                ]} />
              )}
              {toolbar}
              {onUpload && <button type="button" className={`${styles.btn} ${styles.btnPri}`} onClick={onUpload}>{T.upload}</button>}
            </>
          )}
        </div>

        <div className={sl.tools}>
          <input className={`${styles.search} ${sl.search}`} type="search" placeholder={T.search} aria-label={T.search} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className={styles.chips} role="group" aria-label={T.type}>
            {(['all', 'pelicula', 'cancion'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={tipo === t} className={`${styles.chip} ${tipo === t ? styles.chipOn : ''}`}
                onClick={() => setTipo(t)}>{t === 'all' ? `${T.type}: ${T.allChip}` : TIPO_LABEL[t]}</button>
            ))}
          </div>
          <div className={styles.chips} role="group" aria-label={T.level}>
            {(['all', 'beginner', 'medium', 'advance'] as const).map((n) => (
              <button key={n} type="button" aria-pressed={nivel === n} className={`${styles.chip} ${nivel === n ? styles.chipOn : ''}`}
                onClick={() => setNivel(n)}>{n === 'all' ? `${T.level}: ${T.allChip}` : NIVEL_LABEL[n]}</button>
            ))}
          </div>
        </div>

        {error && <div className={styles.err} role="alert">{error}</div>}

        {(canManage || (mine && onDelete)) && visible.length > 0 && (
          <div className={`${sl.bar} ${pickedVisible.length ? sl.barOn : ''}`}>
            <label className={styles.barCheck}>
              <input type="checkbox" className={styles.check} aria-label={T.selectAll}
                checked={pickedVisible.length === visible.length}
                ref={(el) => { if (el) el.indeterminate = pickedVisible.length > 0 && pickedVisible.length < visible.length }}
                onChange={() => setPicked(pickedVisible.length === visible.length ? [] : visible.map((v) => v.id))} />
            </label>
            {pickedVisible.length > 0 ? (
              <>
                <span className={styles.barCount}>{T.selected(pickedVisible.length)}</span>
                {canManage && <ActionMenu label={T.addTo} align="start" trigger={T.addTo} items={addMenu(pickedVisible)} />}
                {canManage && folder && (
                  <button type="button" className={styles.linkBtn} onClick={() => takeOut(folder, pickedVisible)}>{T.takeOut(pickedVisible.length)}</button>
                )}
                {manageVideos && pickedRows.some((v) => !v.publishedAt) && (
                  <button type="button" className={styles.linkBtn} onClick={() => setPublishing({ ids: pickedRows.filter((v) => !v.publishedAt).map((v) => v.id), edit: false })}>
                    {T.publishMany(pickedRows.filter((v) => !v.publishedAt).length)}
                  </button>
                )}
                {manageVideos && pickedRows.some((v) => v.publishedAt) && (
                  <button type="button" className={styles.linkBtn} onClick={() => unpublish(pickedVisible)}>{T.unpublishMany(pickedRows.filter((v) => v.publishedAt).length)}</button>
                )}
                {mine && onDelete && (
                  <button type="button" className={`${styles.linkBtn} ${styles.dangerTxt}`} onClick={() => setDeleting(pickedVisible)}>{T.deleteMany(pickedVisible.length)}</button>
                )}
                <span className={styles.sp} />
                <button type="button" className={styles.linkBtn} onClick={() => setPicked([])}>{T.clear}</button>
              </>
            ) : <span className={styles.barHint}>{canManage ? T.dragHint : ''}</span>}
          </div>
        )}

        {visible.length === 0 ? (
          <div className={styles.emptyPane}>
            {inSel.length > 0 ? <p className={styles.muted}>{T.noResults}</p>
              : current.kind === 'loose' ? <p className={styles.muted}>{T.emptyLoose}</p>
              : current.kind === 'folder' ? <><p><b>{T.emptyFolder}</b></p>{canManage && <p className={styles.muted}>{T.emptyFolderAdmin}</p>}</>
              : <p className={styles.muted}>{T.emptyView}</p>}
          </div>
        ) : (
          <ul className={sl.grid}>
            {visible.map((v) => {
              const on = picked.includes(v.id)
              const selectable = canManage || (mine && !!onDelete)
              const expired = v.status === 'expired'
              const folderNames = current.kind !== 'folder' ? folders.filter((f) => f.videoIds.includes(v.id)).map((f) => f.name) : []
              const menu = cardMenu(v)
              return (
                <li key={v.id} className={`${sl.card} ${on ? sl.cardOn : ''} ${pickedVisible.length ? sl.picking : ''}`} data-testid="shared-card"
                  draggable={canManage} onDragStart={canManage ? (e) => onDragStart(e, v.id) : undefined}>
                  <button type="button" className={`${sl.thumb} ${expired ? sl.thumbOff : ''}`}
                    onClick={() => (pickedVisible.length && selectable ? setPicked((p) => (on ? p.filter((x) => x !== v.id) : [...p, v.id])) : !expired && onOpen(v.id))}
                    aria-label={`${T.open} ${v.originalName}`}>
                    <PlayIcon />
                  </button>
                  {manageVideos && (
                    <span className={`${sl.status} ${v.publishedAt ? sl.statusPub : ''}`}>{expired ? T.expired : v.publishedAt ? T.published : T.private}</span>
                  )}
                  {selectable && (
                    <label className={sl.check}>
                      <input type="checkbox" className={styles.check} checked={on} aria-label={T.select(v.originalName)}
                        onChange={() => setPicked((p) => (on ? p.filter((x) => x !== v.id) : [...p, v.id]))} />
                    </label>
                  )}
                  <div className={sl.body}>
                    <div className={sl.nameRow}>
                      <span className={sl.name} title={v.originalName}>{v.originalName}</span>
                      {menu.length > 1 && <ActionMenu label={T.more(v.originalName)} items={menu} />}
                    </div>
                    <div className={sl.meta}>
                      {v.sharedType && <span className={styles.tag}>{TIPO_LABEL[v.sharedType]}</span>}
                      {v.sharedLevel && <span className={styles.tag}>{NIVEL_LABEL[v.sharedLevel]}</span>}
                      <span>{T.phrases(v.phraseCount)}</span>
                    </div>
                    {folderNames.length > 0 && (
                      <div className={sl.folders}><FolderGlyph className={styles.inFolderIco} /><span>{folderNames.join(', ')}</span></div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {!mine && !canManage && <p className={sl.note}>{T.readOnly}</p>}
      </section>

      {toast && (
        <div className={styles.toast} role="status">
          <span>{toast.text}</span>
          {toast.undo && <button type="button" className={styles.toastBtn} onClick={toast.undo}>{T.undo}</button>}
          <button type="button" className={styles.toastX} aria-label="Cerrar aviso" onClick={() => setToast(null)}>×</button>
        </div>
      )}
      {confirmDel && folder && (
        <Modal label={T.removeTitle(folder.name)} onClose={() => setConfirmDel(false)}>
          <h3 className={cd.cdTitle}>{T.removeTitle(folder.name)}</h3>
          <p className={cd.tcHint} style={{ margin: 0, fontSize: 16 }}>{T.removeNote}</p>
          <div className={cd.cdBtns}>
            <button type="button" className={cd.tcBtn} onClick={() => setConfirmDel(false)} disabled={busy} data-autofocus>{T.cancel}</button>
            <button type="button" className={cd.cdDangerBtn} onClick={deleteFolder} disabled={busy}>{busy ? '…' : T.remove}</button>
          </div>
        </Modal>
      )}
      {publishing && (
        <PublishDialog ids={publishing.ids} edit={publishing.edit} videos={byId}
          onClose={() => setPublishing(null)}
          onDone={(n, edit) => { setPublishing(null); setPicked([]); if (!edit) setToast({ text: T.publishedOk(n) }); onChanged?.() }} />
      )}
      {deleting && (() => {
        const rows = deleting.map((id) => byId.get(id)).filter((v): v is BrowserVideo => !!v)
        const pub = rows.filter((v) => v.publishedAt)
        const name = rows.length === 1 ? rows[0].originalName : undefined
        return (
          <Modal label={T.deleteTitle(rows.length, name)} onClose={() => setDeleting(null)}>
            <h3 className={cd.cdTitle}>{T.deleteTitle(rows.length, name)}</h3>
            <p className={cd.tcHint} style={{ margin: 0, fontSize: 16 }}>{pub.length ? T.deletePubNote(pub.length, rows.length) : T.deleteNote}</p>
            <div className={cd.cdBtns}>
              <button type="button" className={cd.tcBtn} onClick={() => setDeleting(null)} data-autofocus>{T.cancel}</button>
              {pub.length > 0 && manageVideos && (
                <button type="button" className={cd.tcBtn} onClick={() => { setDeleting(null); unpublish(pub.map((v) => v.id)) }}>{T.unpublishInstead}</button>
              )}
              <button type="button" className={cd.cdDangerBtn} onClick={() => doDelete(rows.map((v) => v.id))}>{T.deleteDo}</button>
            </div>
          </Modal>
        )
      })()}
      {renamingVideo && (
        <VideoNameDialog videoId={renamingVideo.id} name={renamingVideo.originalName}
          onSaved={() => { setRenamingVideo(null); onChanged?.() }} onClose={() => setRenamingVideo(null)} />
      )}
      {assignTarget && <AssignToStudents videoId={assignTarget.id} videoName={assignTarget.name} onClose={() => setAssignTarget(null)} />}
    </div>
  )
}

// ── Publicar (o editar tipo y nivel): uno o varios ──
function PublishDialog({ ids, edit, videos, onClose, onDone }: {
  ids: string[]; edit: boolean; videos: Map<string, BrowserVideo>
  onClose: () => void; onDone: (n: number, edit: boolean) => void
}) {
  const T = SHARED_TEXTS
  const first = videos.get(ids[0])
  const [tipo, setTipo] = useState<SharedType | ''>(edit ? first?.sharedType ?? '' : '')
  const [nivel, setNivel] = useState<SharedLevel | ''>(edit ? first?.sharedLevel ?? '' : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const title = edit ? T.editTitle(first?.originalName ?? '') : T.publishTitle(ids.length, first?.originalName)

  async function save() {
    if (!tipo || !nivel) { setError(T.publishNeed); return }
    setBusy(true); setError('')
    const results = await Promise.all(ids.map((id) => fetch(`/api/videos/${id}/share`, {
      method: edit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sharedType: tipo, sharedLevel: nivel }),
    }).then((r) => r.ok).catch(() => false)))
    setBusy(false)
    if (results.some((ok) => !ok)) { setError('No se pudo publicar.'); return }
    onDone(ids.length, edit)
  }

  return (
    <Modal label={title} onClose={onClose}>
      <h3 className={cd.cdTitle}>{title}</h3>
      {!edit && <p className={cd.tcHint} style={{ margin: '0 0 16px' }}>{T.publishNote}</p>}
      <div className={sl.pubField}>
        <span className={sl.pubLbl}>{T.type}</span>
        <div className={styles.chips} role="radiogroup" aria-label={T.type}>
          {(['pelicula', 'cancion'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} className={`${styles.chip} ${tipo === t ? styles.chipOn : ''}`}
              onClick={() => setTipo(t)}>{TIPO_LABEL[t]}</button>
          ))}
        </div>
      </div>
      <div className={sl.pubField}>
        <span className={sl.pubLbl}>{T.level}</span>
        <div className={styles.chips} role="radiogroup" aria-label={T.level}>
          {(['beginner', 'medium', 'advance'] as const).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={nivel === n} className={`${styles.chip} ${nivel === n ? styles.chipOn : ''}`}
              onClick={() => setNivel(n)}>{NIVEL_LABEL[n]}</button>
          ))}
        </div>
      </div>
      {error && <div role="alert" className={cd.tcError} style={{ marginTop: 12 }}>{error}</div>}
      <div className={cd.cdBtns}>
        <button type="button" className={cd.tcBtn} onClick={onClose} disabled={busy}>{T.cancel}</button>
        <button type="button" className={cd.tcPrimary} onClick={save} disabled={busy}>{busy ? '…' : edit ? T.save : T.publishDo}</button>
      </div>
    </Modal>
  )
}
