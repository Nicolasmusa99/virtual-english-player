'use client'
import { useEffect, useState } from 'react'
import styles from './page.module.css'

// Video-centric: dado un video, tildar/destildar a qué alumnos MÍOS está asignado.
// Cruza GET /api/users (alumnos) con GET /api/assignments (para saber cuáles ya lo
// tienen). Solo endpoints scopeados; el backend rechaza fuera de alcance. Cada
// toggle persiste al instante (no hay "guardar"), así que cerrar no pierde nada.
// Rediseño (fase 5): la ventana blanca del aula (exitOverlay/exitDialog) y filas.
interface StudentRow { id: string; email: string | null; role: string | null }

export default function AssignToStudents({
  videoId,
  videoName,
  onClose,
}: {
  videoId: string
  videoName: string
  onClose: () => void
}) {
  const [students, setStudents] = useState<StudentRow[]>([])
  const [assignedTo, setAssignedTo] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  // Cerrar con Escape (además del backdrop y "Cerrar").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setError('')
      try {
        const [uRes, aRes] = await Promise.all([fetch('/api/users'), fetch('/api/assignments')])
        if (!uRes.ok || !aRes.ok) throw new Error()
        const uData = await uRes.json()
        const aData = await aRes.json()
        if (!alive) return
        setStudents((uData.users ?? []).filter((u: StudentRow) => u.role === 'alumno'))
        const set = new Set<string>()
        for (const a of aData.assignments ?? []) if (a.videoId === videoId) set.add(a.studentId)
        setAssignedTo(set)
      } catch { if (alive) setError('No se pudieron cargar los alumnos.') }
      finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [videoId])

  async function toggle(studentId: string) {
    const isA = assignedTo.has(studentId)
    setBusy((b) => ({ ...b, [studentId]: true }))
    try {
      const res = await fetch('/api/assignments', {
        method: isA ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, videoId }),
      })
      if (!res.ok && !(isA && res.status === 404)) throw new Error()
      setAssignedTo((prev) => {
        const next = new Set(prev)
        if (isA) next.delete(studentId); else next.add(studentId)
        return next
      })
    } catch { setError('No se pudo actualizar la asignación.') }
    finally { setBusy((b) => ({ ...b, [studentId]: false })) }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Asignar “${videoName}”`}
      onClick={onClose}
      className={styles.exitOverlay}
    >
      <div onClick={(e) => e.stopPropagation()} className={styles.exitDialog}>
        <div className={styles.exitTitle}>Asignar “{videoName}” a…</div>
        {error && <div className={styles.errorBox}>{error}</div>}
        {loading ? (
          <div className={styles.progSub}>Cargando alumnos…</div>
        ) : students.length === 0 ? (
          <div className={styles.progSub}>No tenés alumnos todavía.</div>
        ) : (
          <div className={styles.list}>
            {students.map((s) => {
              const isA = assignedTo.has(s.id)
              return (
                <div key={s.id} className={styles.row}>
                  <span className={styles.rowText}>{s.email}</span>
                  {isA && <span className={styles.rowOk}>Asignado</span>}
                  <button
                    className={isA ? styles.discardBtn : styles.restoreBtn}
                    disabled={busy[s.id]}
                    onClick={() => toggle(s.id)}>
                    {busy[s.id] ? '…' : isA ? 'Quitar' : 'Asignar'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <button className={styles.tbBtn} style={{ alignSelf: 'flex-end', marginTop: 8 }} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}
