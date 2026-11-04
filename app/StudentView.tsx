'use client'
import { useCallback, useEffect, useState } from 'react'
import styles from './page.module.css'
import fs from './folders.module.css'
import TeacherClasses from './TeacherClasses'
import FolderBox, { FolderIcon } from './FolderBox'
import { FOLDER_NAME_ERROR, FOLDER_NAME_MAX, groupByFolder, normalizeFolderName, UNFILED_LABEL } from '@/lib/folderView'

// Cara visible de /api/assignments (lado alumno). Solo consume endpoints ya
// scopeados por el backend; la seguridad real vive allá. NO toca captions.
// Rediseño (fase 5): el material en filas del aula y las tarjetas con miniatura.
// Carpetas (2026-11): el material del alumno, ordenado en SUS carpetas (las arma su profe
// o el admin): crear, renombrar, subir / bajar, eliminar (los videos quedan "Sin
// carpeta"), mover un video a otra carpeta y asignar directo dentro de una carpeta.
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

const TIPO: Record<string, string> = { pelicula: 'Película', cancion: 'Canción' }
const NIVEL: Record<string, string> = { beginner: 'Beginner', medium: 'Medium', advance: 'Advance' }

export const MATERIAL_TEXTS = {
  title: 'Material',
  newFolder: '+ Nueva carpeta',
  assign: '+ Asignar material',
  folderName: 'Nombre de la carpeta',
  create: 'Crear carpeta',
  cancel: 'Cancelar',
  moveTo: 'Mover a',
  open: 'Abrir', remove: 'Quitar',
  empty: 'Este alumno todavía no tiene material asignado.',
  emptyFolder: 'Esta carpeta está vacía. Asigná material y elegí esta carpeta.',
  removeNote: 'Los videos de esta carpeta no se le sacan al alumno: quedan en "Sin carpeta".',
  assignIn: 'Asignar en',
  done: 'Listo',
} as const

const playIcon = <svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="8 5 19 12 8 19 8 5" fill="currentColor" /></svg>

export default function StudentView({
  studentId,
  studentName = null,
  onOpenVideo,
}: {
  studentId: string
  /** Para saludar con el nombre en la invitación del horario. */
  studentName?: string | null
  onOpenVideo: (videoId: string) => void
}) {
  const T = MATERIAL_TEXTS
  const [assigned, setAssigned] = useState<AssignedRow[]>([])
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dest, setDest] = useState('') // carpeta donde se asigna ('' = sin carpeta)
  const [shared, setShared] = useState<SharedRow[]>([])
  const [sharedLoading, setSharedLoading] = useState(false)
  const [sharedError, setSharedError] = useState('')
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [a, f] = await Promise.all([
        fetch(`/api/assignments?studentId=${encodeURIComponent(studentId)}`),
        fetch(`/api/folders?studentId=${encodeURIComponent(studentId)}`),
      ])
      if (!a.ok) throw new Error()
      setAssigned((await a.json()).assignments ?? [])
      setFolders(f.ok ? (await f.json()).folders ?? [] : [])
    } catch { setError('No se pudo cargar el material asignado.') }
    finally { setLoading(false) }
  }, [studentId])
  useEffect(() => { load() }, [load])

  async function loadShared() {
    setSharedLoading(true); setSharedError('')
    try {
      const res = await fetch('/api/shared-videos')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setShared(data.videos ?? [])
    } catch { setSharedError('No se pudo cargar la biblioteca.') }
    finally { setSharedLoading(false) }
  }
  function openPicker(folderId = '') { setDest(folderId); setPickerOpen(true); if (shared.length === 0) loadShared() }

  const assignedIds = new Set(assigned.map((a) => a.videoId))

  async function send(url: string, method: string, body?: unknown): Promise<string | null> {
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      if (res.ok) return null
      const data = await res.json().catch(() => null)
      return typeof data?.error === 'string' ? data.error : 'No se pudo guardar.'
    } catch { return 'No se pudo guardar.' }
  }

  async function toggle(videoId: string, isAssigned: boolean) {
    setBusy((b) => ({ ...b, [videoId]: true }))
    const body = isAssigned ? { studentId, videoId } : { studentId, videoId, ...(dest ? { folderId: dest } : {}) }
    const e = await send('/api/assignments', isAssigned ? 'DELETE' : 'POST', body)
    if (e && !(isAssigned && /no existe/.test(e))) setError(isAssigned ? 'No se pudo quitar el material.' : 'No se pudo asignar el material.')
    await load()
    setBusy((b) => ({ ...b, [videoId]: false }))
  }

  async function moveVideo(videoId: string, folderId: string) {
    setAssigned((list) => list.map((a) => (a.videoId === videoId ? { ...a, folderId: folderId || null } : a)))
    const e = await send('/api/assignments', 'PATCH', { studentId, videoId, folderId: folderId || null })
    if (e) { setError(e); load() }
  }

  async function createFolder() {
    const name = normalizeFolderName(newName)
    if (!name) { setError(FOLDER_NAME_ERROR); return }
    const e = await send('/api/folders', 'POST', { name, studentId })
    if (e) { setError(e); return }
    setCreating(false); setNewName(''); setError('')
    load()
  }

  const groups = groupByFolder(assigned, folders)
  const index = (id: string) => folders.findIndex((f) => f.id === id)

  return (
    <div>

      <TeacherClasses studentId={studentId} studentName={studentName} />

      <div className={fs.head}>
        <h2 className={fs.title}>{T.title}</h2>
        <button type="button" className={fs.btn} onClick={() => { setCreating(true); setNewName('') }}>{T.newFolder}</button>
        <button type="button" className={`${fs.btn} ${fs.btnPri}`} onClick={() => openPicker()}>{T.assign}</button>
      </div>

      {error && <div className={fs.err} role="alert">{error}</div>}

      {creating && (
        <div className={fs.newRow}>
          <FolderIcon className={fs.fIcon} />
          <input className={fs.nameInput} autoFocus placeholder={T.folderName} aria-label={T.folderName} maxLength={FOLDER_NAME_MAX}
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createFolder() } if (e.key === 'Escape') setCreating(false) }} />
          <button type="button" className={`${fs.btn} ${fs.btnPri}`} onClick={createFolder}>{T.create}</button>
          <button type="button" className={fs.btn} onClick={() => setCreating(false)}>{T.cancel}</button>
        </div>
      )}

      {loading ? (
        <div className={styles.progSub}>Cargando…</div>
      ) : assigned.length === 0 && folders.length === 0 ? (
        <p className={fs.note}>{T.empty}</p>
      ) : (
        groups.map(({ folder, items }) => (
          <FolderBox key={folder?.id ?? 'loose'} name={folder?.name ?? null} count={items.length}
            canUp={!!folder && index(folder.id) > 0} canDown={!!folder && index(folder.id) < folders.length - 1}
            removeNote={T.removeNote}
            onRename={async (name) => { const e = await send(`/api/folders/${folder!.id}`, 'PATCH', { name }); if (!e) load(); return e }}
            onMove={async (dir) => { const e = await send(`/api/folders/${folder!.id}`, 'PATCH', { move: dir }); if (e) setError(e); load() }}
            onRemove={async () => { const e = await send(`/api/folders/${folder!.id}`, 'DELETE'); if (!e) load(); return e }}>
            {items.length === 0 ? (
              <div className={fs.emptyFolder}>{T.emptyFolder}</div>
            ) : (
              <ul className={fs.items}>
                {items.map((a) => (
                  <li key={a.videoId} className={`${fs.item} ${a.active ? '' : fs.itemOff}`}>
                    <span className={fs.thumb}>{playIcon}</span>
                    <span className={fs.itemName}>
                      <b>{a.originalName}</b>
                      <span className={fs.itemMeta}>
                        {[a.sharedType && TIPO[a.sharedType], a.sharedLevel && NIVEL[a.sharedLevel], !a.active && 'No disponible'].filter(Boolean).join(', ')}
                      </span>
                    </span>
                    {(folders.length > 0) && (
                      <select className={fs.move} aria-label={`${T.moveTo}: ${a.originalName}`} value={a.folderId ?? ''}
                        onChange={(e) => moveVideo(a.videoId, e.target.value)}>
                        <option value="">{UNFILED_LABEL}</option>
                        {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    )}
                    <button className={styles.tbBtn} disabled={!a.active} onClick={() => onOpenVideo(a.videoId)}>{T.open}</button>
                    <button className={styles.discardBtn} disabled={busy[a.videoId]} onClick={() => toggle(a.videoId, true)}>{T.remove}</button>
                  </li>
                ))}
              </ul>
            )}
          </FolderBox>
        ))
      )}

      {/* ── Asignar material ── */}
      {pickerOpen && (
        <div className={fs.picker}>
          <div className={fs.pickerHead}>
            <h3 className={fs.pickerTitle}>Biblioteca compartida</h3>
            {folders.length > 0 && (
              <label className={fs.dest}>{T.assignIn}
                <select className={fs.move} value={dest} onChange={(e) => setDest(e.target.value)}>
                  <option value="">{UNFILED_LABEL}</option>
                  {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
            )}
            <button className={fs.btn} onClick={() => setPickerOpen(false)}>{T.done}</button>
          </div>
          {sharedError && (
            <div className={styles.errorBox}>{sharedError} <button className={styles.tbBtn} onClick={loadShared}>Reintentar</button></div>
          )}
          {sharedLoading ? (
            <div className={styles.progSub}>Cargando material…</div>
          ) : shared.length === 0 && !sharedError ? (
            <div className={styles.progSub}>Todavía no hay material disponible. El administrador publica acá los videos para tus clases.</div>
          ) : (
            <div className={styles.sharedGrid}>
              {shared.map((v) => {
                const isA = assignedIds.has(v.id)
                return (
                  <div key={v.id} className={styles.sharedCard}>
                    <div className={styles.sharedThumb}><svg className={styles.thumbIco} viewBox="0 0 24 24" aria-hidden="true"><polygon points="8 5 19 12 8 19 8 5" fill="currentColor" /></svg></div>
                    <div className={styles.sharedName}>{v.originalName}</div>
                    <div className={styles.libChips}>
                      {v.sharedType && <span className={`${styles.chip} ${styles.chipTipo}`}>{TIPO[v.sharedType]}</span>}
                      {v.sharedLevel && <span className={`${styles.chip} ${styles.chipNivel}`}>{NIVEL[v.sharedLevel]}</span>}
                    </div>
                    <div className={styles.libActions}>
                      {isA && <span className={styles.rowOk}>Asignado</span>}
                      <button
                        className={isA ? styles.discardBtn : styles.restoreBtn}
                        disabled={busy[v.id]}
                        onClick={() => toggle(v.id, isA)}>
                        {busy[v.id] ? '…' : isA ? 'Quitar' : 'Asignar'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
