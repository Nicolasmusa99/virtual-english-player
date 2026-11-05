'use client'
// Biblioteca compartida (rediseño 2026-11-04, a lo Drive). Lo ven el admin y los profes.
//   · A la izquierda: "Todos los videos", las carpetas y "Sin carpeta". A la derecha, lo que
//     hay en la elegida, con buscador y filtros de tipo y nivel.
//   · El ADMIN además arma las carpetas acá mismo: crear, renombrar, ordenar y eliminar;
//     tildar varios videos y agregarlos a una carpeta (o sacarlos) de una sola vez, o
//     arrastrarlos a una carpeta de la izquierda. Un video puede estar en varias carpetas.
//   · El PROFE navega las carpetas (solo lectura) y asigna videos a sus alumnos.
// Solo muestra videos PUBLICADOS. Habla con /api/shared-videos y /api/folders (el servidor
// decide quién puede qué: el profe no puede tocar carpetas aunque lo intente).
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import styles from './material.module.css'
import sl from './shared.module.css'
import cd from './classes.module.css'
import type { SharedType, SharedLevel } from '@/lib/db/schema'
import AssignToStudents from './AssignToStudents'
import ActionMenu, { type MenuItem } from './ActionMenu'
import { FolderGlyph, PlayIcon } from './MaterialPicker'
import { Modal } from './ClassDialog'
import { FOLDER_NAME_ERROR, FOLDER_NAME_MAX, normalizeFolderName } from '@/lib/folderView'
import { NIVEL_LABEL, TIPO_LABEL, countLabel } from '@/lib/materialView'

interface SharedVideoRow {
  id: string
  originalName: string
  durationSec: number | null
  sharedType: SharedType | null
  sharedLevel: SharedLevel | null
  publishedAt: string | null
  ownerName: string | null
  phraseCount: number
}
type LibFolder = { id: string; name: string; videoIds: string[] }
type Sel = { kind: 'all' } | { kind: 'loose' } | { kind: 'folder'; id: string }

export const SHARED_TEXTS = {
  all: 'Todos los videos', loose: 'Sin carpeta', folders: 'Carpetas',
  newFolder: 'Nueva carpeta', folderName: 'Nombre de la carpeta', create: 'Crear', cancel: 'Cancelar', save: 'Guardar',
  search: 'Buscar en la biblioteca', type: 'Tipo', level: 'Nivel', allChip: 'Todos',
  open: 'Abrir', assign: 'Asignar a alumnos',
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
  emptyFolder: 'Esta carpeta está vacía.',
  emptyFolderAdmin: 'Andá a "Todos los videos", tildá los que quieras y agregalos a esta carpeta, o arrastralos hasta acá.',
  emptyLoose: 'Todos los videos están en alguna carpeta.',
  noResults: 'No hay videos con esa búsqueda o esos filtros.',
  loadError: 'No se pudo cargar la biblioteca compartida.', retry: 'Reintentar',
} as const

const DRAG_TYPE = 'application/x-ve-shared'

export default function SharedLibrary({ onOpen, assignable, canManage = false }: {
  onOpen: (id: string) => void
  assignable?: boolean
  /** El admin arma las carpetas desde acá. */
  canManage?: boolean
}) {
  const T = SHARED_TEXTS
  const [videos, setVideos] = useState<SharedVideoRow[]>([])
  const [folders, setFolders] = useState<LibFolder[]>([])
  const [loading, setLoading] = useState(true)
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

  const loadFolders = useCallback(async (): Promise<LibFolder[]> => {
    try {
      const res = await fetch('/api/folders')
      if (!res.ok) return []
      const list: LibFolder[] = (await res.json()).folders ?? []
      setFolders(list)
      return list
    } catch { return [] }
  }, [])
  const load = useCallback(async () => {
    setLoading(true); setLoadError('')
    try {
      const res = await fetch('/api/shared-videos')
      if (!res.ok) throw new Error()
      setVideos((await res.json()).videos ?? [])
    } catch { setLoadError(T.loadError) }
    finally { setLoading(false) }
    await loadFolders()
  }, [loadFolders, T.loadError])
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

  // Solo lo publicado: las carpetas pueden tener videos privados del admin.
  const published = useMemo(() => new Set(videos.map((v) => v.id)), [videos])
  const inFolder = (f: LibFolder) => f.videoIds.filter((id) => published.has(id))
  const inSome = useMemo(() => new Set(folders.flatMap((f) => f.videoIds)), [folders])
  const current: Sel = sel.kind === 'folder' && !folders.some((f) => f.id === sel.id) ? { kind: 'all' } : sel
  const folder = current.kind === 'folder' ? folders.find((f) => f.id === current.id) ?? null : null
  const fIndex = folder ? folders.findIndex((f) => f.id === folder.id) : -1

  const inSel = useMemo(() => {
    if (current.kind === 'all') return videos
    if (current.kind === 'loose') return videos.filter((v) => !inSome.has(v.id))
    const ids = new Set(folder?.videoIds ?? [])
    return videos.filter((v) => ids.has(v.id))
  }, [current, videos, inSome, folder])
  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('es')
    return inSel.filter((v) => (!needle || v.originalName.toLocaleLowerCase('es').includes(needle)) &&
      (tipo === 'all' || v.sharedType === tipo) && (nivel === 'all' || v.sharedLevel === nivel))
  }, [inSel, q, tipo, nivel])
  const pickedVisible = picked.filter((id) => visible.some((v) => v.id === id))
  const title = current.kind === 'all' ? T.all : current.kind === 'loose' ? T.loose : folder?.name ?? ''

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

  const navBtn = (key: string, s: Sel, label: string, count: number, icon: 'all' | 'folder' | 'loose', f?: LibFolder) => {
    const on = current.kind === s.kind && (s.kind !== 'folder' || (current.kind === 'folder' && current.id === s.id))
    return (
      <li key={key}>
        <button type="button" aria-current={on ? 'true' : undefined}
          className={`${styles.navItem} ${on ? styles.navOn : ''} ${f && dropOn === f.id ? styles.navDrop : ''}`}
          onClick={() => go(s)} {...(f ? dropProps(f) : {})}>
          {icon === 'all'
            ? <svg className={styles.navIco} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></svg>
            : <FolderGlyph className={`${styles.navIco} ${icon === 'loose' ? styles.navIcoSoft : ''}`} />}
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
  if (videos.length === 0) return <div className={styles.emptyCard} style={{ margin: 0 }}><span className={styles.emptyIco} aria-hidden="true"><PlayIcon /></span><p className={styles.muted}>{T.empty}</p></div>

  const looseCount = videos.filter((v) => !inSome.has(v.id)).length
  const showFolders = canManage || folders.length > 0

  return (
    <div className={showFolders ? styles.layout : undefined}>
      {showFolders && (
        <nav className={styles.nav} aria-label={T.folders}>
          <ul className={styles.navList}>{navBtn('all', { kind: 'all' }, T.all, videos.length, 'all')}</ul>
          <div className={styles.navHead}>{T.folders}</div>
          <ul className={styles.navList}>
            {folders.map((f) => navBtn(f.id, { kind: 'folder', id: f.id }, f.name, inFolder(f).length, 'folder', f))}
            {navBtn('loose', { kind: 'loose' }, T.loose, looseCount, 'loose')}
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

        {canManage && visible.length > 0 && (
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
                <ActionMenu label={T.addTo} align="start" trigger={T.addTo} items={addMenu(pickedVisible)} />
                {folder && (
                  <button type="button" className={`${styles.linkBtn} ${styles.dangerTxt}`} onClick={() => takeOut(folder, pickedVisible)}>{T.takeOut(pickedVisible.length)}</button>
                )}
                <span className={styles.sp} />
                <button type="button" className={styles.linkBtn} onClick={() => setPicked([])}>{T.clear}</button>
              </>
            ) : <span className={styles.barHint}>{T.dragHint}</span>}
          </div>
        )}

        {visible.length === 0 ? (
          <div className={styles.emptyPane}>
            {inSel.length > 0 ? <p className={styles.muted}>{T.noResults}</p>
              : current.kind === 'loose' ? <p className={styles.muted}>{T.emptyLoose}</p>
              : <><p><b>{T.emptyFolder}</b></p>{canManage && <p className={styles.muted}>{T.emptyFolderAdmin}</p>}</>}
          </div>
        ) : (
          <ul className={sl.grid}>
            {visible.map((v) => {
              const on = picked.includes(v.id)
              const folderNames = current.kind === 'all' ? folders.filter((f) => f.videoIds.includes(v.id)).map((f) => f.name) : []
              return (
                <li key={v.id} className={`${sl.card} ${on ? sl.cardOn : ''} ${pickedVisible.length ? sl.picking : ''}`} data-testid="shared-card"
                  draggable={canManage} onDragStart={canManage ? (e) => onDragStart(e, v.id) : undefined}>
                  <button type="button" className={sl.thumb} onClick={() => (pickedVisible.length && canManage ? setPicked((p) => (on ? p.filter((x) => x !== v.id) : [...p, v.id])) : onOpen(v.id))}
                    aria-label={`${T.open} ${v.originalName}`}>
                    <PlayIcon />
                  </button>
                  {canManage && (
                    <label className={sl.check}>
                      <input type="checkbox" className={styles.check} checked={on} aria-label={T.select(v.originalName)}
                        onChange={() => setPicked((p) => (on ? p.filter((x) => x !== v.id) : [...p, v.id]))} />
                    </label>
                  )}
                  <div className={sl.body}>
                    <div className={sl.nameRow}>
                      <span className={sl.name} title={v.originalName}>{v.originalName}</span>
                      {(assignable || canManage) && (
                        <ActionMenu label={T.more(v.originalName)} items={[
                          { label: T.open, onSelect: () => onOpen(v.id) },
                          ...(assignable ? [{ label: T.assign, onSelect: () => setAssignTarget({ id: v.id, name: v.originalName }) }] : []),
                          ...(canManage ? [{ kind: 'sep' as const }, { kind: 'title' as const, label: T.addTo.replace('…', '') }, ...addMenu([v.id])] : []),
                          ...(canManage && folder ? [{ kind: 'sep' as const }, { label: T.takeOut(1), danger: true, onSelect: () => takeOut(folder, [v.id]) }] : []),
                        ]} />
                      )}
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

        {!canManage && <p className={sl.note}>{T.readOnly}</p>}
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
      {assignTarget && <AssignToStudents videoId={assignTarget.id} videoName={assignTarget.name} onClose={() => setAssignTarget(null)} />}
    </div>
  )
}
