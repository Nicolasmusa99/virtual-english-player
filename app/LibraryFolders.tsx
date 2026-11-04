'use client'
// Carpetas de la BIBLIOTECA (rediseño 2026-11), en "Mi biblioteca" del admin. Igual que el
// material de un alumno: las carpetas a la izquierda y lo que tiene la elegida a la derecha.
// "Agregar videos" abre la biblioteca en una ventana para tildar varios de una. Un video
// puede estar en varias carpetas. Los profes las ven en la biblioteca compartida, solo con
// los videos publicados. Habla con /api/folders y /api/folders/[id]/videos (solo admin: lo
// chequea el servidor).
import { useCallback, useEffect, useState } from 'react'
import styles from './material.module.css'
import cd from './classes.module.css'
import ActionMenu from './ActionMenu'
import MaterialPicker, { FolderGlyph, PlayIcon } from './MaterialPicker'
import { Modal } from './ClassDialog'
import { FOLDER_NAME_ERROR, FOLDER_NAME_MAX, normalizeFolderName } from '@/lib/folderView'
import { NIVEL_LABEL, TIPO_LABEL, countLabel } from '@/lib/materialView'
import type { LibraryVideoRow } from './LibraryList'

type LibFolder = { id: string; name: string; videoIds: string[] }

export const LIB_FOLDER_TEXTS = {
  title: 'Carpetas',
  newFolder: 'Nueva carpeta',
  firstFolder: 'Crear la primera carpeta',
  folderName: 'Nombre de la carpeta',
  create: 'Crear', cancel: 'Cancelar', save: 'Guardar',
  intro: 'Armá carpetas para ordenar la biblioteca. Los profes las ven en la biblioteca compartida, solo con los videos publicados.',
  addVideos: 'Agregar videos',
  addTitle: (n: string) => `Agregar videos a "${n}"`,
  addConfirm: (n: number) => (n === 0 ? 'Agregar' : n === 1 ? 'Agregar 1 video' : `Agregar ${n} videos`),
  already: 'Ya está en la carpeta',
  takeOut: 'Sacar de la carpeta', open: 'Abrir',
  more: (n: string) => `Más acciones de ${n}`,
  folderMore: (n: string) => `Opciones de la carpeta ${n}`,
  rename: 'Renombrar', up: 'Subir', down: 'Bajar', remove: 'Eliminar carpeta',
  removeTitle: (n: string) => `Eliminar la carpeta "${n}"`,
  removeNote: 'Los videos no se borran: solo dejan de estar en esta carpeta.',
  empty: 'Esta carpeta está vacía.',
  emptyCta: 'Agregale videos de tu biblioteca. Un video puede estar en varias carpetas.',
  unpublished: 'Privado: los profes no lo ven',
} as const

export default function LibraryFolders({ videos, onOpen }: { videos: LibraryVideoRow[]; onOpen: (id: string) => void }) {
  const T = LIB_FOLDER_TEXTS
  const [folders, setFolders] = useState<LibFolder[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [selId, setSelId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<LibFolder[]> => {
    try {
      const res = await fetch('/api/folders')
      if (!res.ok) throw new Error()
      const list: LibFolder[] = (await res.json()).folders ?? []
      setFolders(list)
      return list
    } catch { setError('No se pudieron cargar las carpetas.'); return [] }
    finally { setLoaded(true) }
  }, [])
  useEffect(() => { load() }, [load])

  async function send(url: string, method: string, body?: unknown): Promise<string | null> {
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      if (res.ok) return null
      const data = await res.json().catch(() => null)
      return typeof data?.error === 'string' ? data.error : 'No se pudo guardar.'
    } catch { return 'No se pudo guardar.' }
  }

  const folder = folders.find((f) => f.id === selId) ?? folders[0] ?? null
  const index = folder ? folders.findIndex((f) => f.id === folder.id) : -1
  const byId = new Map(videos.map((v) => [v.id, v]))
  const inside = folder ? folder.videoIds.map((id) => byId.get(id)).filter((v): v is LibraryVideoRow => !!v) : []

  function pick(id: string) { setSelId(id); setRenaming(false) }

  async function create() {
    const name = normalizeFolderName(newName)
    if (!name) { setError(FOLDER_NAME_ERROR); return }
    const e = await send('/api/folders', 'POST', { name })
    if (e) { setError(e); return }
    const before = new Set(folders.map((f) => f.id))
    setCreating(false); setNewName(''); setError('')
    const fresh = (await load()).find((f) => !before.has(f.id))
    if (fresh) pick(fresh.id)
  }
  async function rename() {
    if (!folder) return
    const name = normalizeFolderName(renameValue)
    if (!name) { setError(FOLDER_NAME_ERROR); return }
    if (name !== folder.name) {
      const e = await send(`/api/folders/${folder.id}`, 'PATCH', { name })
      if (e) { setError(e); return }
      setFolders((list) => list.map((f) => (f.id === folder.id ? { ...f, name } : f)))
    }
    setRenaming(false); setError('')
  }
  async function move(dir: 'up' | 'down') {
    if (!folder) return
    const e = await send(`/api/folders/${folder.id}`, 'PATCH', { move: dir })
    if (e) setError(e)
    load()
  }
  async function remove() {
    if (!folder) return
    setBusy(true)
    const e = await send(`/api/folders/${folder.id}`, 'DELETE')
    setBusy(false); setConfirm(false)
    if (e) { setError(e); return }
    setSelId(null); load()
  }
  async function addMany(ids: string[]): Promise<string | null> {
    if (!folder) return null
    const fid = folder.id
    setFolders((list) => list.map((f) => (f.id === fid ? { ...f, videoIds: [...f.videoIds, ...ids] } : f)))
    const errs = await Promise.all(ids.map((videoId) => send(`/api/folders/${fid}/videos`, 'POST', { videoId })))
    const e = errs.find(Boolean)
    if (e) { load(); return e }
    setPicker(false)
    return null
  }
  async function takeOut(videoId: string) {
    if (!folder) return
    const fid = folder.id
    setFolders((list) => list.map((f) => (f.id === fid ? { ...f, videoIds: f.videoIds.filter((v) => v !== videoId) } : f)))
    const e = await send(`/api/folders/${fid}/videos`, 'DELETE', { videoId })
    if (e) { setError(e); load() }
  }

  const createForm = (
    <div className={styles.newFolder}>
      <input className={styles.input} autoFocus placeholder={T.folderName} aria-label={T.folderName} maxLength={FOLDER_NAME_MAX}
        value={newName} onChange={(e) => { setNewName(e.target.value); setError('') }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create() } if (e.key === 'Escape') setCreating(false) }} />
      <div className={styles.rowBtns}>
        <button type="button" className={`${styles.btn} ${styles.btnSm} ${styles.btnPri}`} onClick={create}>{T.create}</button>
        <button type="button" className={`${styles.btn} ${styles.btnSm}`} onClick={() => setCreating(false)}>{T.cancel}</button>
      </div>
    </div>
  )

  if (!loaded) return null

  return (
    <div style={{ marginBottom: 36 }}>
      <h2 className={styles.paneTitle} style={{ marginBottom: 14 }}>{T.title}</h2>
      {error && <div className={styles.err} role="alert">{error}</div>}

      {folders.length === 0 ? (
        <div className={styles.emptyCard} style={{ margin: 0, maxWidth: 'none' }}>
          <span className={styles.emptyIco} aria-hidden="true"><FolderGlyph /></span>
          <p className={styles.muted} style={{ maxWidth: 460 }}>{T.intro}</p>
          {creating ? <div style={{ width: '100%', maxWidth: 320 }}>{createForm}</div> : (
            <div className={styles.emptyBtns}>
              <button type="button" className={`${styles.btn} ${styles.btnPri}`} onClick={() => { setCreating(true); setNewName('') }}>{T.firstFolder}</button>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.layout}>
          <nav className={styles.nav} aria-label={T.title}>
            <ul className={styles.navList}>
              {folders.map((f) => {
                const on = folder?.id === f.id
                return (
                  <li key={f.id}>
                    <button type="button" aria-current={on ? 'true' : undefined} className={`${styles.navItem} ${on ? styles.navOn : ''}`} onClick={() => pick(f.id)}>
                      <FolderGlyph className={styles.navIco} />
                      <span className={styles.navName}>{f.name}</span>
                      <span className={styles.navCount}>{f.videoIds.filter((id) => byId.has(id)).length}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {creating ? createForm : (
              <button type="button" className={styles.navAdd} onClick={() => { setCreating(true); setNewName('') }}>+ {T.newFolder}</button>
            )}
          </nav>

          {folder && (
            <section className={styles.pane} aria-label={folder.name} data-testid="folder">
              <div className={styles.paneHead}>
                {renaming ? (
                  <div className={styles.renameRow}>
                    <input className={styles.input} autoFocus aria-label={T.folderName} maxLength={FOLDER_NAME_MAX} value={renameValue}
                      onChange={(e) => { setRenameValue(e.target.value); setError('') }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); rename() } if (e.key === 'Escape') setRenaming(false) }} />
                    <button type="button" className={`${styles.btn} ${styles.btnPri}`} onClick={rename}>{T.save}</button>
                    <button type="button" className={styles.btn} onClick={() => setRenaming(false)}>{T.cancel}</button>
                  </div>
                ) : (
                  <>
                    <h3 className={styles.paneTitle}>{folder.name}<span className={styles.paneCount}>{countLabel(inside.length)}</span></h3>
                    <ActionMenu label={T.folderMore(folder.name)} items={[
                      { label: T.rename, onSelect: () => { setRenameValue(folder.name); setRenaming(true) } },
                      { label: T.up, disabled: index <= 0, onSelect: () => move('up') },
                      { label: T.down, disabled: index >= folders.length - 1, onSelect: () => move('down') },
                      { kind: 'sep' },
                      { label: T.remove, danger: true, onSelect: () => setConfirm(true) },
                    ]} />
                    <button type="button" className={`${styles.btn} ${styles.btnPri}`} onClick={() => setPicker(true)}>+ {T.addVideos}</button>
                  </>
                )}
              </div>

              {inside.length === 0 ? (
                <div className={styles.emptyPane}>
                  <p><b>{T.empty}</b></p>
                  <p className={styles.muted}>{T.emptyCta}</p>
                  <button type="button" className={`${styles.btn} ${styles.btnPri}`} onClick={() => setPicker(true)}>+ {T.addVideos}</button>
                </div>
              ) : (
                <ul className={styles.rows} style={{ borderRadius: 10 }}>
                  {inside.map((v) => (
                    <li key={v.id} className={styles.row}>
                      <span className={styles.thumb} aria-hidden="true"><PlayIcon /></span>
                      <span className={styles.vName}>
                        <b>{v.originalName}</b>
                        <span className={styles.vMeta}>
                          {v.publishedAt && v.sharedType && <span className={styles.tag}>{TIPO_LABEL[v.sharedType]}</span>}
                          {v.publishedAt && v.sharedLevel && <span className={styles.tag}>{NIVEL_LABEL[v.sharedLevel]}</span>}
                          {!v.publishedAt && <span>{T.unpublished}</span>}
                        </span>
                      </span>
                      <button type="button" className={`${styles.btn} ${styles.btnSm}`} onClick={() => onOpen(v.id)}>{T.open}</button>
                      <ActionMenu label={T.more(v.originalName)} items={[
                        { label: T.takeOut, danger: true, onSelect: () => takeOut(v.id) },
                      ]} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      {picker && folder && (
        <MaterialPicker title={T.addTitle(folder.name)}
          videos={videos.map((v) => ({ id: v.id, name: v.originalName, type: v.publishedAt ? v.sharedType : null, level: v.publishedAt ? v.sharedLevel : null, note: v.publishedAt ? null : T.unpublished }))}
          already={new Set(folder.videoIds)} alreadyLabel={T.already} emptyText=""
          confirmLabel={T.addConfirm} onConfirm={addMany} onClose={() => setPicker(false)} />
      )}
      {confirm && folder && (
        <Modal label={T.removeTitle(folder.name)} onClose={() => setConfirm(false)}>
          <h3 className={cd.cdTitle}>{T.removeTitle(folder.name)}</h3>
          <p className={cd.tcHint} style={{ margin: 0, fontSize: 16 }}>{T.removeNote}</p>
          <div className={cd.cdBtns}>
            <button type="button" className={cd.tcBtn} onClick={() => setConfirm(false)} disabled={busy} data-autofocus>{T.cancel}</button>
            <button type="button" className={cd.cdDangerBtn} onClick={remove} disabled={busy}>{busy ? '…' : T.remove}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
