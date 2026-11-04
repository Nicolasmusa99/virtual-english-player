'use client'
// La pantalla de un alumno, del lado del profe y del admin (rediseño 2026-11, a lo Drive /
// Classroom). Dos pestañas: "Material" y "Clases".
// Material: a la izquierda sus carpetas (Todo el material, cada carpeta, Sin carpeta) y a la
// derecha lo que hay en la elegida. Para ordenar:
//   · cada video tiene "Mover a" en su menú "⋯";
//   · se pueden tildar varios y moverlos o quitarlos juntos;
//   · se puede arrastrar un video (o los tildados) a una carpeta de la izquierda;
//   · "Asignar material" abre la biblioteca en una ventana: se tildan varios y se asignan
//     de una, y van a la carpeta que se está mirando (se puede cambiar ahí mismo).
// Quitar avisa con "Deshacer". Solo consume endpoints ya scopeados por el backend
// (/api/assignments, /api/folders, /api/shared-videos): la seguridad vive allá.
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import styles from './material.module.css'
import cd from './classes.module.css'
import TeacherClasses from './TeacherClasses'
import ActionMenu, { type MenuItem } from './ActionMenu'
import MaterialPicker, { FolderGlyph, PlayIcon } from './MaterialPicker'
import { Modal } from './ClassDialog'
import { FOLDER_NAME_ERROR, FOLDER_NAME_MAX, normalizeFolderName, UNFILED_LABEL } from '@/lib/folderView'
import {
  ALL, NIVEL_LABEL, TIPO_LABEL, countLabel, destFor, itemsIn, sameSel, validSel, type FolderSel,
} from '@/lib/materialView'

interface AssignedRow {
  videoId: string
  originalName: string
  sharedType: 'pelicula' | 'cancion' | null
  sharedLevel: 'beginner' | 'medium' | 'advance' | null
  active: boolean // false = el admin despublicó el video → "no disponible"
  folderId: string | null
}
interface SharedRow {
  id: string
  originalName: string
  sharedType: 'pelicula' | 'cancion' | null
  sharedLevel: 'beginner' | 'medium' | 'advance' | null
}
type FolderRow = { id: string; name: string }

export const MATERIAL_TEXTS = {
  tabMaterial: 'Material', tabClasses: 'Clases',
  allMaterial: 'Todo el material',
  folders: 'Carpetas',
  newFolder: 'Nueva carpeta',
  folderName: 'Nombre de la carpeta',
  create: 'Crear', cancel: 'Cancelar', save: 'Guardar',
  assign: 'Asignar material',
  open: 'Abrir',
  moveTo: 'Mover a',
  moveMany: 'Mover a…',
  removeOne: 'Quitar del alumno',
  more: (n: string) => `Más acciones de ${n}`,
  folderMore: (n: string) => `Opciones de la carpeta ${n}`,
  rename: 'Renombrar', up: 'Subir', down: 'Bajar', removeFolder: 'Eliminar carpeta',
  removeFolderTitle: (n: string) => `Eliminar la carpeta "${n}"`,
  removeFolderNote: (n: number) => n === 0
    ? 'La carpeta está vacía.'
    : `${n === 1 ? 'El video' : `Los ${n} videos`} no se le sacan al alumno: ${n === 1 ? 'queda' : 'quedan'} en "Sin carpeta".`,
  selectAll: 'Seleccionar todos',
  select: (n: string) => `Seleccionar ${n}`,
  selected: (n: number) => (n === 1 ? '1 seleccionado' : `${n} seleccionados`),
  clear: 'Cancelar selección',
  removeMany: (n: number) => (n === 1 ? 'Quitar 1 video' : `Quitar ${n} videos`),
  removeManyTitle: (n: number) => (n === 1 ? '¿Quitarle este video al alumno?' : `¿Quitarle ${n} videos al alumno?`),
  removeManyNote: 'Dejan de aparecerle. Los podés volver a asignar cuando quieras.',
  unavailable: 'No disponible',
  dragHint: 'Arrastrá videos a una carpeta para ordenarlos.',
  empty: 'Este alumno todavía no tiene material asignado.',
  emptyCta: 'Elegí videos de la biblioteca: se le asignan al instante y los ve en su inicio.',
  emptyFolder: 'Esta carpeta está vacía.',
  emptyFolderCta: 'Asigná material acá o arrastrá videos desde "Todo el material".',
  emptyLoose: 'Todo el material está en carpetas.',
  pickerTitle: 'Asignar material',
  pickerIn: 'Se agrega en',
  pickerAlready: 'Ya asignado',
  pickerEmpty: 'Todavía no hay material publicado. El administrador publica los videos para las clases.',
  pickerConfirm: (n: number) => (n === 0 ? 'Asignar' : n === 1 ? 'Asignar 1 video' : `Asignar ${n} videos`),
  assigned: (n: number, where: string) => `${n === 1 ? 'Se asignó 1 video' : `Se asignaron ${n} videos`} en ${where}.`,
  moved: (n: number, where: string) => `${n === 1 ? 'Se movió 1 video' : `Se movieron ${n} videos`} a ${where}.`,
  removed: (n: number) => (n === 1 ? 'Se quitó 1 video.' : `Se quitaron ${n} videos.`),
  undo: 'Deshacer',
  loading: 'Cargando material…',
  loadError: 'No se pudo cargar el material asignado.',
  retry: 'Reintentar',
} as const

const DRAG_TYPE = 'application/x-ve-videos'

export default function StudentView({
  studentId,
  studentName = null,
  initialTab = 'material',
  onOpenVideo,
}: {
  studentId: string
  /** Para saludar con el nombre en la invitación del horario. */
  studentName?: string | null
  /** Desde la agenda o "Hoy" se entra por las clases; desde "Alumnos", por el material. */
  initialTab?: 'material' | 'classes'
  onOpenVideo: (videoId: string) => void
}) {
  const T = MATERIAL_TEXTS
  const [tab, setTab] = useState(initialTab)
  const [assigned, setAssigned] = useState<AssignedRow[]>([])
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [sel, setSel] = useState<FolderSel>(ALL)
  const [picked, setPicked] = useState<string[]>([])
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // nueva carpeta / renombrar / eliminar
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [confirmFolder, setConfirmFolder] = useState<FolderRow | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  // asignar material
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dest, setDest] = useState('')
  const [shared, setShared] = useState<SharedRow[]>([])
  const [sharedLoading, setSharedLoading] = useState(false)
  const [sharedError, setSharedError] = useState('')

  // arrastrar
  const [dropOn, setDropOn] = useState<string | null>(null)

  const load = useCallback(async (): Promise<FolderRow[] | null> => {
    setLoadError('')
    try {
      const [a, f] = await Promise.all([
        fetch(`/api/assignments?studentId=${encodeURIComponent(studentId)}`),
        fetch(`/api/folders?studentId=${encodeURIComponent(studentId)}`),
      ])
      if (!a.ok) throw new Error()
      setAssigned(((await a.json()).assignments ?? []).map((r: AssignedRow) => ({ ...r, folderId: r.folderId ?? null })))
      const fl: FolderRow[] = f.ok ? (await f.json()).folders ?? [] : []
      setFolders(fl)
      return fl
    } catch { setLoadError(T.loadError); return null }
    finally { setLoading(false) }
  }, [studentId, T.loadError])
  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const folderIds = useMemo(() => folders.map((f) => f.id), [folders])
  const current = validSel(sel, folderIds)
  const currentFolder = current.kind === 'folder' ? folders.find((f) => f.id === current.id) ?? null : null
  const visible = itemsIn(assigned, folderIds, current)
  const looseCount = itemsIn(assigned, folderIds, { kind: 'loose' }).length
  const nameOfFolder = (id: string | null) => (id && folders.find((f) => f.id === id)?.name) || UNFILED_LABEL
  const paneTitle = current.kind === 'all' ? T.allMaterial : current.kind === 'loose' ? UNFILED_LABEL : currentFolder?.name ?? ''
  const pickedVisible = picked.filter((id) => visible.some((v) => v.videoId === id))

  // Cambiar de carpeta limpia la selección y cierra lo que estaba abierto.
  function go(s: FolderSel) { setSel(s); setPicked([]); setRenaming(false) }

  function say(text: string, undo?: () => void) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ text, undo })
    toastTimer.current = setTimeout(() => setToast(null), 7000)
  }

  async function send(url: string, method: string, body?: unknown): Promise<string | null> {
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      if (res.ok) return null
      const data = await res.json().catch(() => null)
      return typeof data?.error === 'string' ? data.error : 'No se pudo guardar.'
    } catch { return 'No se pudo guardar.' }
  }

  // ── videos ──
  async function moveMany(ids: string[], folderId: string | null) {
    const toMove = ids.filter((id) => (assigned.find((a) => a.videoId === id)?.folderId ?? null) !== folderId)
    if (toMove.length === 0) return
    setError('')
    setAssigned((list) => list.map((a) => (toMove.includes(a.videoId) ? { ...a, folderId } : a)))
    setPicked([])
    const errs = await Promise.all(toMove.map((videoId) => send('/api/assignments', 'PATCH', { studentId, videoId, folderId })))
    const e = errs.find(Boolean)
    if (e) { setError(e); load(); return }
    say(T.moved(toMove.length, nameOfFolder(folderId)))
  }

  async function removeMany(ids: string[]) {
    const rows = assigned.filter((a) => ids.includes(a.videoId))
    if (rows.length === 0) return
    setError('')
    setAssigned((list) => list.filter((a) => !ids.includes(a.videoId)))
    setPicked([])
    const errs = await Promise.all(rows.map((r) => send('/api/assignments', 'DELETE', { studentId, videoId: r.videoId })))
    const e = errs.find((x) => x && !/no existe/.test(x))
    if (e) { setError('No se pudo quitar el material.'); load(); return }
    say(T.removed(rows.length), async () => {
      setToast(null)
      await Promise.all(rows.map((r) => send('/api/assignments', 'POST', { studentId, videoId: r.videoId, ...(r.folderId ? { folderId: r.folderId } : {}) })))
      load()
    })
  }

  // ── carpetas ──
  async function createFolder() {
    const name = normalizeFolderName(newName)
    if (!name) { setError(FOLDER_NAME_ERROR); return }
    const e = await send('/api/folders', 'POST', { name, studentId })
    if (e) { setError(e); return }
    setCreating(false); setNewName(''); setError('')
    const before = new Set(folderIds)
    // Se abre la carpeta nueva, para llenarla.
    const fresh = (await load())?.find((f) => !before.has(f.id))
    if (fresh) go({ kind: 'folder', id: fresh.id })
  }
  async function renameFolder() {
    if (!currentFolder) return
    const name = normalizeFolderName(renameValue)
    if (!name) { setError(FOLDER_NAME_ERROR); return }
    if (name === currentFolder.name) { setRenaming(false); return }
    const e = await send(`/api/folders/${currentFolder.id}`, 'PATCH', { name })
    if (e) { setError(e); return }
    setFolders((list) => list.map((f) => (f.id === currentFolder.id ? { ...f, name } : f)))
    setRenaming(false); setError('')
  }
  async function moveFolder(dir: 'up' | 'down') {
    if (!currentFolder) return
    const e = await send(`/api/folders/${currentFolder.id}`, 'PATCH', { move: dir })
    if (e) setError(e)
    load()
  }
  async function deleteFolder() {
    if (!confirmFolder) return
    setBusy(true)
    const e = await send(`/api/folders/${confirmFolder.id}`, 'DELETE')
    setBusy(false)
    if (e) { setError(e); setConfirmFolder(null); return }
    setConfirmFolder(null)
    go(ALL)
    load()
  }

  // ── asignar ──
  async function loadShared() {
    setSharedLoading(true); setSharedError('')
    try {
      const res = await fetch('/api/shared-videos')
      if (!res.ok) throw new Error()
      setShared((await res.json()).videos ?? [])
    } catch { setSharedError('No se pudo cargar la biblioteca.') }
    finally { setSharedLoading(false) }
  }
  function openPicker() { setDest(destFor(current)); setPickerOpen(true); if (shared.length === 0) loadShared() }
  async function assignMany(ids: string[]): Promise<string | null> {
    const folderId = dest || null
    const errs = await Promise.all(ids.map((videoId) => send('/api/assignments', 'POST', { studentId, videoId, ...(folderId ? { folderId } : {}) })))
    const e = errs.find(Boolean)
    await load()
    if (e) return 'No se pudo asignar el material.'
    setPickerOpen(false)
    go(folderId ? { kind: 'folder', id: folderId } : current.kind === 'loose' ? current : ALL)
    say(T.assigned(ids.length, nameOfFolder(folderId)))
    return null
  }

  // ── arrastrar a una carpeta ──
  function onDragStart(e: DragEvent, videoId: string) {
    const ids = picked.includes(videoId) ? picked : [videoId]
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids))
    e.dataTransfer.setData('text/plain', ids.join(','))
    e.dataTransfer.effectAllowed = 'move'
  }
  const dropProps = (key: string, folderId: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      e.preventDefault(); e.dataTransfer.dropEffect = 'move'
      if (dropOn !== key) setDropOn(key)
    },
    onDragLeave: () => setDropOn((d) => (d === key ? null : d)),
    onDrop: (e: DragEvent) => {
      e.preventDefault(); setDropOn(null)
      try { moveMany(JSON.parse(e.dataTransfer.getData(DRAG_TYPE)), folderId) } catch { /* nada */ }
    },
  })

  const index = currentFolder ? folders.findIndex((f) => f.id === currentFolder.id) : -1
  const moveItems = (current: string | null, onPick: (folderId: string | null) => void): MenuItem[] => [
    { kind: 'title', label: T.moveTo },
    ...folders.map((f) => ({ label: f.name, checked: current === f.id, onSelect: () => onPick(f.id) })),
    { label: UNFILED_LABEL, checked: current === null, onSelect: () => onPick(null) },
  ]

  const navItem = (key: string, s: FolderSel, label: string, count: number, folderId: string | null | undefined) => {
    const on = sameSel(current, s)
    const droppable = folderId !== undefined
    return (
      <li key={key}>
        <button type="button" aria-current={on ? 'true' : undefined}
          className={`${styles.navItem} ${on ? styles.navOn : ''} ${dropOn === key ? styles.navDrop : ''}`}
          onClick={() => go(s)} {...(droppable ? dropProps(key, folderId ?? null) : {})}>
          {s.kind === 'all'
            ? <svg className={styles.navIco} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></svg>
            : <FolderGlyph className={`${styles.navIco} ${s.kind === 'loose' ? styles.navIcoSoft : ''}`} />}
          <span className={styles.navName}>{label}</span>
          <span className={styles.navCount}>{count}</span>
        </button>
      </li>
    )
  }

  const tabs = (
    <div className={styles.tabs} role="tablist" aria-label="Secciones del alumno">
      {(['material', 'classes'] as const).map((t) => (
        <button key={t} type="button" role="tab" aria-selected={tab === t} className={`${styles.tab} ${tab === t ? styles.tabOn : ''}`}
          onClick={() => setTab(t)}>
          {t === 'material' ? T.tabMaterial : T.tabClasses}
          {t === 'material' && !loading && <span className={styles.tabCount}>{assigned.length}</span>}
        </button>
      ))}
    </div>
  )

  if (tab === 'classes') {
    return <div>{tabs}<TeacherClasses studentId={studentId} studentName={studentName} /></div>
  }

  return (
    <div>
      {tabs}
      {loading ? (
        <p className={styles.muted}>{T.loading}</p>
      ) : loadError ? (
        <div className={styles.err} role="alert">{loadError} <button type="button" className={styles.linkBtn} onClick={() => { setLoading(true); load() }}>{T.retry}</button></div>
      ) : assigned.length === 0 && folders.length === 0 && !creating ? (
        <div className={styles.emptyCard}>
          <span className={styles.emptyIco} aria-hidden="true"><PlayIcon /></span>
          <h3 className={styles.emptyTitle}>{T.empty}</h3>
          <p className={styles.muted}>{T.emptyCta}</p>
          <div className={styles.emptyBtns}>
            <button type="button" className={`${styles.btn} ${styles.btnPri}`} onClick={openPicker}>{T.assign}</button>
            <button type="button" className={styles.btn} onClick={() => { setCreating(true); setNewName('') }}>{T.newFolder}</button>
          </div>
        </div>
      ) : (
        <div className={styles.layout}>
          {/* ── Carpetas ── */}
          <nav className={styles.nav} aria-label={T.folders}>
            <ul className={styles.navList}>
              {navItem('all', ALL, T.allMaterial, assigned.length, undefined)}
            </ul>
            <div className={styles.navHead}>{T.folders}</div>
            <ul className={styles.navList}>
              {folders.map((f) => navItem(f.id, { kind: 'folder', id: f.id }, f.name, assigned.filter((a) => a.folderId === f.id).length, f.id))}
              {(looseCount > 0 || folders.length > 0) && navItem('loose', { kind: 'loose' }, UNFILED_LABEL, looseCount, null)}
            </ul>
            {creating ? (
              <div className={styles.newFolder}>
                <input className={styles.input} autoFocus placeholder={T.folderName} aria-label={T.folderName} maxLength={FOLDER_NAME_MAX}
                  value={newName} onChange={(e) => { setNewName(e.target.value); setError('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createFolder() } if (e.key === 'Escape') setCreating(false) }} />
                <div className={styles.rowBtns}>
                  <button type="button" className={`${styles.btn} ${styles.btnSm} ${styles.btnPri}`} onClick={createFolder}>{T.create}</button>
                  <button type="button" className={`${styles.btn} ${styles.btnSm}`} onClick={() => setCreating(false)}>{T.cancel}</button>
                </div>
              </div>
            ) : (
              <button type="button" className={styles.navAdd} onClick={() => { setCreating(true); setNewName('') }}>+ {T.newFolder}</button>
            )}
          </nav>

          {/* ── Lo que hay en la carpeta elegida ── */}
          <section className={styles.pane} aria-label={paneTitle}>
            <div className={styles.paneHead}>
              {renaming && currentFolder ? (
                <div className={styles.renameRow}>
                  <input className={styles.input} autoFocus aria-label={T.folderName} maxLength={FOLDER_NAME_MAX} value={renameValue}
                    onChange={(e) => { setRenameValue(e.target.value); setError('') }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); renameFolder() } if (e.key === 'Escape') setRenaming(false) }} />
                  <button type="button" className={`${styles.btn} ${styles.btnPri}`} onClick={renameFolder}>{T.save}</button>
                  <button type="button" className={styles.btn} onClick={() => setRenaming(false)}>{T.cancel}</button>
                </div>
              ) : (
                <>
                  <h2 className={styles.paneTitle}>{paneTitle}<span className={styles.paneCount}>{countLabel(visible.length)}</span></h2>
                  {currentFolder && (
                    <ActionMenu label={T.folderMore(currentFolder.name)} items={[
                      { label: T.rename, onSelect: () => { setRenameValue(currentFolder.name); setRenaming(true) } },
                      { label: T.up, disabled: index <= 0, onSelect: () => moveFolder('up') },
                      { label: T.down, disabled: index < 0 || index >= folders.length - 1, onSelect: () => moveFolder('down') },
                      { kind: 'sep' },
                      { label: T.removeFolder, danger: true, onSelect: () => setConfirmFolder(currentFolder) },
                    ]} />
                  )}
                  <button type="button" className={`${styles.btn} ${styles.btnPri}`} onClick={openPicker}>+ {T.assign}</button>
                </>
              )}
            </div>

            {error && <div className={styles.err} role="alert">{error}</div>}

            {visible.length > 0 && (
              <div className={`${styles.bar} ${pickedVisible.length > 0 ? styles.barOn : ''}`}>
                <label className={styles.barCheck}>
                  <input type="checkbox" className={styles.check} aria-label={T.selectAll}
                    checked={pickedVisible.length === visible.length}
                    ref={(el) => { if (el) el.indeterminate = pickedVisible.length > 0 && pickedVisible.length < visible.length }}
                    onChange={() => setPicked(pickedVisible.length === visible.length ? [] : visible.map((v) => v.videoId))} />
                </label>
                {pickedVisible.length > 0 ? (
                  <>
                    <span className={styles.barCount}>{T.selected(pickedVisible.length)}</span>
                    <ActionMenu label={T.moveMany} align="start" trigger={T.moveMany}
                      items={moveItems(null, (fid) => moveMany(pickedVisible, fid)).map((it) => ('checked' in it ? { ...it, checked: undefined } : it))} />
                    <button type="button" className={`${styles.linkBtn} ${styles.dangerTxt}`} onClick={() => setConfirmRemove(pickedVisible)}>{T.removeMany(pickedVisible.length)}</button>
                    <span className={styles.sp} />
                    <button type="button" className={styles.linkBtn} onClick={() => setPicked([])}>{T.clear}</button>
                  </>
                ) : (
                  folders.length > 0 && <span className={styles.barHint}>{T.dragHint}</span>
                )}
              </div>
            )}

            {visible.length === 0 ? (
              <div className={styles.emptyPane}>
                {current.kind === 'loose' ? <p className={styles.muted}>{T.emptyLoose}</p> : (
                  <>
                    <p><b>{current.kind === 'folder' ? T.emptyFolder : T.empty}</b></p>
                    <p className={styles.muted}>{current.kind === 'folder' ? T.emptyFolderCta : T.emptyCta}</p>
                    <button type="button" className={`${styles.btn} ${styles.btnPri}`} onClick={openPicker}>+ {T.assign}</button>
                  </>
                )}
              </div>
            ) : (
              <ul className={styles.rows}>
                {visible.map((a) => {
                  const on = picked.includes(a.videoId)
                  return (
                    <li key={a.videoId} className={`${styles.row} ${on ? styles.rowOn : ''} ${a.active ? '' : styles.rowOff}`}
                      draggable onDragStart={(e) => onDragStart(e, a.videoId)} data-testid="material-row">
                      <input type="checkbox" className={styles.check} checked={on} aria-label={T.select(a.originalName)}
                        onChange={() => setPicked((p) => (on ? p.filter((x) => x !== a.videoId) : [...p, a.videoId]))} />
                      <span className={styles.thumb} aria-hidden="true"><PlayIcon /></span>
                      <span className={styles.vName}>
                        <b>{a.originalName}</b>
                        <span className={styles.vMeta}>
                          {a.sharedType && <span className={styles.tag}>{TIPO_LABEL[a.sharedType]}</span>}
                          {a.sharedLevel && <span className={styles.tag}>{NIVEL_LABEL[a.sharedLevel]}</span>}
                          {!a.active && <span className={styles.tagOff}>{T.unavailable}</span>}
                          {current.kind === 'all' && folders.length > 0 && (
                            <span className={styles.inFolder}><FolderGlyph className={styles.inFolderIco} />{nameOfFolder(a.folderId)}</span>
                          )}
                        </span>
                      </span>
                      <button type="button" className={`${styles.btn} ${styles.btnSm}`} disabled={!a.active} onClick={() => onOpenVideo(a.videoId)}>{T.open}</button>
                      <ActionMenu label={T.more(a.originalName)} items={[
                        ...moveItems(a.folderId, (fid) => moveMany([a.videoId], fid)),
                        { kind: 'sep' },
                        { label: T.removeOne, danger: true, onSelect: () => removeMany([a.videoId]) },
                      ]} />
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {toast && (
        <div className={styles.toast} role="status">
          <span>{toast.text}</span>
          {toast.undo && <button type="button" className={styles.toastBtn} onClick={toast.undo}>{T.undo}</button>}
          <button type="button" className={styles.toastX} aria-label="Cerrar aviso" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {pickerOpen && (
        <MaterialPicker title={T.pickerTitle}
          videos={shared.map((v) => ({ id: v.id, name: v.originalName, type: v.sharedType, level: v.sharedLevel }))}
          already={new Set(assigned.map((a) => a.videoId))} alreadyLabel={T.pickerAlready}
          loading={sharedLoading} error={sharedError} onRetry={loadShared} emptyText={T.pickerEmpty}
          footer={folders.length > 0 && (
            <label className={styles.destLbl}>{T.pickerIn}
              <select className={styles.select} value={dest} onChange={(e) => setDest(e.target.value)}>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                <option value="">{UNFILED_LABEL}</option>
              </select>
            </label>
          )}
          confirmLabel={T.pickerConfirm} onConfirm={assignMany} onClose={() => setPickerOpen(false)} />
      )}

      {confirmFolder && (
        <Modal label={T.removeFolderTitle(confirmFolder.name)} onClose={() => setConfirmFolder(null)}>
          <h3 className={cd.cdTitle}>{T.removeFolderTitle(confirmFolder.name)}</h3>
          <p className={cd.tcHint} style={{ margin: 0, fontSize: 16 }}>{T.removeFolderNote(assigned.filter((a) => a.folderId === confirmFolder.id).length)}</p>
          <div className={cd.cdBtns}>
            <button type="button" className={cd.tcBtn} onClick={() => setConfirmFolder(null)} disabled={busy} data-autofocus>{T.cancel}</button>
            <button type="button" className={cd.cdDangerBtn} onClick={deleteFolder} disabled={busy}>{busy ? '…' : T.removeFolder}</button>
          </div>
        </Modal>
      )}

      {confirmRemove && (
        <Modal label={T.removeManyTitle(confirmRemove.length)} onClose={() => setConfirmRemove(null)}>
          <h3 className={cd.cdTitle}>{T.removeManyTitle(confirmRemove.length)}</h3>
          <p className={cd.tcHint} style={{ margin: 0, fontSize: 16 }}>{T.removeManyNote}</p>
          <div className={cd.cdBtns}>
            <button type="button" className={cd.tcBtn} onClick={() => setConfirmRemove(null)} data-autofocus>{T.cancel}</button>
            <button type="button" className={cd.cdDangerBtn} onClick={() => { const ids = confirmRemove; setConfirmRemove(null); removeMany(ids) }}>{T.removeMany(confirmRemove.length)}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
