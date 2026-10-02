'use client'
// "Cambiar nombre" / "Agregar nombre" de un usuario: un alumno (su pantalla, lado profe/
// admin) o un profe o admin (desde "Usuarios", solo el admin). Habla solo con PATCH
// /api/users/[id]; quién puede lo decide el servidor (el profe, solo sus alumnos). Misma
// ventana que las de clase (Modal de ClassDialog).
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

export default function StudentNameDialog({ userId, name, title, onSaved, onClose }: {
  userId: string
  name: string | null
  /** "Nombre del profe", "Nombre del admin"… (por defecto, del alumno). */
  title?: string
  onSaved: (name: string) => void
  onClose: () => void
}) {
  const T = STUDENT_NAME_TEXTS
  const heading = title ?? T.title
  const [value, setValue] = useState(name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    const clean = normalizePersonName(value)
    if (!clean) { setError(NAME_ERROR); return }
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
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
    <Modal label={heading} onClose={onClose}>
      <form onSubmit={save}>
        <h3 className={styles.cdTitle}>{heading}</h3>
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
