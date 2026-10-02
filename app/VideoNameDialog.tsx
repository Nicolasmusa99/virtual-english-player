'use client'
// "Cambiar nombre" de un video de "Mi biblioteca" (solo el admin, en SUS videos). Habla solo
// con PATCH /api/videos/[id] { originalName }. Misma ventana que "Cambiar nombre" de un
// alumno (StudentNameDialog).
import { useState, type FormEvent } from 'react'
import styles from './classes.module.css'
import { Modal } from './ClassDialog'
import { normalizeVideoName, VIDEO_NAME_ERROR, VIDEO_NAME_MAX } from '@/lib/videoName'

export const VIDEO_NAME_TEXTS = {
  title: 'Nombre del video',
  label: 'Nombre del video',
  hint: 'Así lo ven los profes y los alumnos.',
  cancel: 'Cancelar',
  save: 'Guardar',
  error: 'No se pudo guardar el nombre.',
} as const

export default function VideoNameDialog({ videoId, name, onSaved, onClose }: {
  videoId: string
  name: string
  onSaved: (name: string) => void
  onClose: () => void
}) {
  const T = VIDEO_NAME_TEXTS
  const [value, setValue] = useState(name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    const clean = normalizeVideoName(value)
    if (!clean) { setError(VIDEO_NAME_ERROR); return }
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/videos/${encodeURIComponent(videoId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ originalName: clean }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(typeof data?.error === 'string' ? data.error : T.error); return }
      onSaved(typeof data?.originalName === 'string' ? data.originalName : clean)
    } catch {
      setError(T.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal label={T.title} onClose={onClose}>
      <form onSubmit={save}>
        <h3 className={styles.cdTitle}>{T.title}</h3>
        <label className={styles.cdField}>
          <span className={styles.cdLbl}>{T.label}</span>
          <input data-autofocus className={styles.cdInput} value={value} maxLength={VIDEO_NAME_MAX} autoComplete="off"
            onChange={(e) => { setValue(e.target.value); setError('') }} />
        </label>
        <p className={styles.tcHint} style={{ margin: '8px 0 0' }}>{T.hint}</p>
        {error && <div role="alert" className={styles.tcError} style={{ marginTop: 10 }}>{error}</div>}
        <div className={styles.cdBtns}>
          <button type="button" className={styles.tcBtn} onClick={onClose} disabled={busy}>{T.cancel}</button>
          <button type="submit" className={styles.tcPrimary} disabled={busy}>{busy ? '…' : T.save}</button>
        </div>
      </form>
    </Modal>
  )
}
