'use client'
// Carpetas de la BIBLIOTECA (2026-11), en "Mi biblioteca" del admin: crear, renombrar,
// subir / bajar, eliminar, y meter o sacar videos (un video puede estar en varias). Los
// profes las ven en la biblioteca compartida, solo con los videos publicados. Habla con
// /api/folders y /api/folders/[id]/videos (solo admin: lo chequea el servidor).
import { useCallback, useEffect, useState } from 'react'
import fs from './folders.module.css'
import FolderBox, { FolderIcon } from './FolderBox'
import { FOLDER_NAME_ERROR, FOLDER_NAME_MAX, normalizeFolderName } from '@/lib/folderView'
import type { LibraryVideoRow } from './LibraryList'

type LibFolder = { id: string; name: string; videoIds: string[] }

export const LIB_FOLDER_TEXTS = {
  title: 'Carpetas',
  newFolder: '+ Nueva carpeta',
  folderName: 'Nombre de la carpeta',
  create: 'Crear carpeta', cancel: 'Cancelar',
  intro: 'Armá carpetas para ordenar la biblioteca. Los profes las ven en la biblioteca compartida, solo con los videos publicados.',
  addVideo: 'Agregar un video…',
  takeOut: 'Sacar', open: 'Abrir',
  empty: 'Carpeta vacía: agregale videos con la lista de abajo.',
  removeNote: 'Los videos no se borran: solo dejan de estar en esta carpeta.',
  unpublished: 'Privado: los profes no lo ven',
} as const

const playIcon = <svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="8 5 19 12 8 19 8 5" fill="currentColor" /></svg>

export default function LibraryFolders({ videos, onOpen }: { videos: LibraryVideoRow[]; onOpen: (id: string) => void }) {
  const T = LIB_FOLDER_TEXTS
  const [folders, setFolders] = useState<LibFolder[]>([])
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/folders')
      if (!res.ok) throw new Error()
      setFolders((await res.json()).folders ?? [])
    } catch { setError('No se pudieron cargar las carpetas.') }
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

  async function create() {
    const name = normalizeFolderName(newName)
    if (!name) { setError(FOLDER_NAME_ERROR); return }
    const e = await send('/api/folders', 'POST', { name })
    if (e) { setError(e); return }
    setCreating(false); setNewName(''); setError(''); load()
  }
  async function addVideo(folderId: string, videoId: string) {
    if (!videoId) return
    setFolders((list) => list.map((f) => (f.id === folderId ? { ...f, videoIds: [...f.videoIds, videoId] } : f)))
    const e = await send(`/api/folders/${folderId}/videos`, 'POST', { videoId })
    if (e) { setError(e); load() }
  }
  async function takeOut(folderId: string, videoId: string) {
    setFolders((list) => list.map((f) => (f.id === folderId ? { ...f, videoIds: f.videoIds.filter((v) => v !== videoId) } : f)))
    const e = await send(`/api/folders/${folderId}/videos`, 'DELETE', { videoId })
    if (e) { setError(e); load() }
  }

  const byId = new Map(videos.map((v) => [v.id, v]))

  return (
    <div style={{ marginBottom: 28 }}>
      <div className={fs.head} style={{ marginTop: 0 }}>
        <h2 className={fs.title}>{T.title}</h2>
        <button type="button" className={fs.btn} onClick={() => { setCreating(true); setNewName('') }}>{T.newFolder}</button>
      </div>
      {folders.length === 0 && !creating && <p className={fs.note}>{T.intro}</p>}
      {error && <div className={fs.err} role="alert">{error}</div>}
      {creating && (
        <div className={fs.newRow}>
          <FolderIcon className={fs.fIcon} />
          <input className={fs.nameInput} autoFocus placeholder={T.folderName} aria-label={T.folderName} maxLength={FOLDER_NAME_MAX}
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create() } if (e.key === 'Escape') setCreating(false) }} />
          <button type="button" className={`${fs.btn} ${fs.btnPri}`} onClick={create}>{T.create}</button>
          <button type="button" className={fs.btn} onClick={() => setCreating(false)}>{T.cancel}</button>
        </div>
      )}

      {folders.map((f, i) => {
        const inside = f.videoIds.map((id) => byId.get(id)).filter((v): v is LibraryVideoRow => !!v)
        const candidates = videos.filter((v) => !f.videoIds.includes(v.id))
        return (
          <FolderBox key={f.id} name={f.name} count={inside.length} canUp={i > 0} canDown={i < folders.length - 1} removeNote={T.removeNote}
            onRename={async (name) => { const e = await send(`/api/folders/${f.id}`, 'PATCH', { name }); if (!e) load(); return e }}
            onMove={async (dir) => { const e = await send(`/api/folders/${f.id}`, 'PATCH', { move: dir }); if (e) setError(e); load() }}
            onRemove={async () => { const e = await send(`/api/folders/${f.id}`, 'DELETE'); if (!e) load(); return e }}>
            {inside.length === 0 ? <div className={fs.emptyFolder}>{T.empty}</div> : (
              <ul className={fs.items}>
                {inside.map((v) => (
                  <li key={v.id} className={fs.item}>
                    <span className={fs.thumb}>{playIcon}</span>
                    <span className={fs.itemName}>
                      <b>{v.originalName}</b>
                      {!v.publishedAt && <span className={fs.itemMeta}>{T.unpublished}</span>}
                    </span>
                    <button type="button" className={fs.txt} onClick={() => onOpen(v.id)}>{T.open}</button>
                    <button type="button" className={`${fs.txt} ${fs.danger}`} onClick={() => takeOut(f.id, v.id)} aria-label={`${T.takeOut} ${v.originalName} de ${f.name}`}>{T.takeOut}</button>
                  </li>
                ))}
              </ul>
            )}
            {candidates.length > 0 && (
              <div className={fs.item} style={{ borderTop: '1.5px solid var(--tiza)' }}>
                <select className={fs.move} style={{ maxWidth: 360, flex: 1 }} value="" aria-label={`${T.addVideo} a ${f.name}`}
                  onChange={(e) => addVideo(f.id, e.target.value)}>
                  <option value="">{T.addVideo}</option>
                  {candidates.map((v) => <option key={v.id} value={v.id}>{v.originalName}</option>)}
                </select>
              </div>
            )}
          </FolderBox>
        )
      })}
    </div>
  )
}
