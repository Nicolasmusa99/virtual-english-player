'use client'
// "Cambiar nombre" / "Agregar nombre" de un alumno (pantalla del alumno, lado profe/admin).
// Habla solo con PATCH /api/users/[id]; quién puede lo decide el servidor (el profe, solo
// sus alumnos). Misma ventana que las de clase (Modal de ClassDialog).
import { useState, type FormEvent } from 'react'
import styles from './classes.module.css'
import { Modal } from './ClassDialog'
import { NAME_ERROR, NAME_MAX, normalizePersonName } from '@/lib/personName'

export const STUDENT_NAME_TEXTS = {
  title: 'Nombre del alumno',
  label: 'Nombre y apellido',
  cancel: 'Cancelar',
  save: 'Guardar',
  error: 'No se pudo guardar el nombre.',
} as const

export default function StudentNameDialog({ studentId, name, onSaved, onClose }: {
  studentId: string
  name: string | null
  onSaved: (name: string) => void
  onClose: () => void
}) {
  const T = STUDENT_NAME_TEXTS
  const [value, setValue] = useState(name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    const clean = normalizePersonName(value)
    if (!clean) { setError(NAME_ERROR); return }
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(studentId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: clean }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(typeof data?.error === 'string' ? data.error : T.error); return }
      onSaved(typeof data?.name === 'string' ? data.name : clean)
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
          <input data-autofocus className={styles.cdInput} value={value} maxLength={NAME_MAX} autoComplete="off"
            onChange={(e) => { setValue(e.target.value); setError('') }} />
        </label>
        {error && <div role="alert" className={styles.tcError} style={{ marginTop: 10 }}>{error}</div>}
        <div className={styles.cdBtns}>
          <button type="button" className={styles.tcBtn} onClick={onClose} disabled={busy}>{T.cancel}</button>
          <button type="submit" className={styles.tcPrimary} disabled={busy}>{busy ? '…' : T.save}</button>
        </div>
      </form>
    </Modal>
  )
}
