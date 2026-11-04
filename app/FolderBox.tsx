'use client'
// Carpetas (2026-11) — la "caja" de una carpeta, con su encabezado editable (renombrar en
// el lugar, subir / bajar, eliminar con confirmación). La usan el material de un alumno
// (StudentView) y las carpetas de la biblioteca del admin. La de "Sin carpeta" no se edita.
import { useState, type ReactNode } from 'react'
import styles from './folders.module.css'
import cd from './classes.module.css'
import { Modal } from './ClassDialog'
import { FOLDER_NAME_ERROR, FOLDER_NAME_MAX, normalizeFolderName, UNFILED_LABEL } from '@/lib/folderView'

export const FOLDER_TEXTS = {
  rename: 'Renombrar', up: 'Subir la carpeta', down: 'Bajar la carpeta', remove: 'Eliminar',
  save: 'Guardar', cancel: 'Cancelar',
  removeTitle: (n: string) => `Eliminar la carpeta "${n}"`,
  removeConfirm: 'Eliminar carpeta',
  count: (n: number) => (n === 1 ? '1 video' : `${n} videos`),
} as const

export const FolderIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)

export default function FolderBox({ name, count, canUp = false, canDown = false, editable = true, removeNote, onRename, onMove, onRemove, children }: {
  name: string | null // null = "Sin carpeta"
  count: number
  canUp?: boolean
  canDown?: boolean
  editable?: boolean
  /** Qué pasa con lo que tiene al borrarla (va en la confirmación). */
  removeNote?: string
  onRename?: (name: string) => Promise<string | null> // devuelve un error o null
  onMove?: (dir: 'up' | 'down') => void
  onRemove?: () => Promise<string | null>
  children: ReactNode
}) {
  const T = FOLDER_TEXTS
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name ?? '')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const isLoose = name === null
  const label = name ?? UNFILED_LABEL

  async function save() {
    const clean = normalizeFolderName(value)
    if (!clean) { setError(FOLDER_NAME_ERROR); return }
    if (clean === name) { setEditing(false); return }
    setBusy(true)
    const e = await onRename?.(clean)
    setBusy(false)
    if (e) { setError(e); return }
    setEditing(false); setError('')
  }
  async function remove() {
    setBusy(true)
    const e = await onRemove?.()
    setBusy(false)
    if (e) { setError(e); setConfirm(false); return }
    setConfirm(false)
  }

  return (
    <section className={`${styles.folder} ${isLoose ? styles.loose : ''}`} aria-label={label} data-testid="folder">
      <div className={styles.fHead}>
        <FolderIcon className={styles.fIcon} />
        {editing ? (
          <>
            <input className={styles.nameInput} value={value} maxLength={FOLDER_NAME_MAX} autoFocus aria-label="Nombre de la carpeta"
              onChange={(e) => { setValue(e.target.value); setError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } if (e.key === 'Escape') { setEditing(false); setValue(name ?? ''); setError('') } }} />
            <button type="button" className={styles.txt} onClick={save} disabled={busy}>{T.save}</button>
            <button type="button" className={styles.txt} onClick={() => { setEditing(false); setValue(name ?? ''); setError('') }}>{T.cancel}</button>
          </>
        ) : (
          <>
            <h3 className={styles.fName}>{label}<span className={styles.fCount}>{T.count(count)}</span></h3>
            {!isLoose && editable && (
              <div className={styles.fActs}>
                <button type="button" className={styles.txt} onClick={() => { setValue(name ?? ''); setEditing(true) }}>{T.rename}</button>
                <button type="button" className={styles.icoBtn} onClick={() => onMove?.('up')} disabled={!canUp} aria-label={`${T.up} ${label}`}>↑</button>
                <button type="button" className={styles.icoBtn} onClick={() => onMove?.('down')} disabled={!canDown} aria-label={`${T.down} ${label}`}>↓</button>
                <button type="button" className={`${styles.txt} ${styles.danger}`} onClick={() => setConfirm(true)} aria-label={`${T.remove} la carpeta ${label}`}>{T.remove}</button>
              </div>
            )}
          </>
        )}
      </div>
      {error && <div className={styles.err} role="alert" style={{ margin: '10px 14px' }}>{error}</div>}
      {children}
      {confirm && (
        <Modal label={T.removeTitle(label)} onClose={() => setConfirm(false)}>
          <h3 className={cd.cdTitle}>{T.removeTitle(label)}</h3>
          {removeNote && <p className={cd.tcHint} style={{ margin: 0, fontSize: 16 }}>{removeNote}</p>}
          <div className={cd.cdBtns}>
            <button type="button" className={cd.tcBtn} onClick={() => setConfirm(false)} disabled={busy} data-autofocus>{T.cancel}</button>
            <button type="button" className={cd.cdDangerBtn} onClick={remove} disabled={busy}>{busy ? '…' : T.removeConfirm}</button>
          </div>
        </Modal>
      )}
    </section>
  )
}
