'use client'
import { useEffect, useState } from 'react'
import styles from './page.module.css'

// Video-centric: dado un video, tildar/destildar a qué alumnos MÍOS está asignado.
// Cruza GET /api/users (alumnos) con GET /api/assignments (para saber cuáles ya lo
// tienen). Solo endpoints scopeados; el backend rechaza fuera de alcance. Cada
// toggle persiste al instante (no hay "guardar"), así que cerrar no pierde nada.
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
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--p2)', border: '1px solid var(--ln)', borderRadius: 10, padding: 16, width: '100%', maxWidth: 460, maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div className={styles.dzSub}>Asignar “{videoName}” a…</div>
        {error && <div className={styles.errorBox}>{error}</div>}
        {loading ? (
          <div className={styles.progSub}>Cargando alumnos…</div>
        ) : students.length === 0 ? (
          <div className={styles.progSub}>No tenés alumnos todavía.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {students.map((s) => {
              const isA = assignedTo.has(s.id)
              return (
                <div key={s.id} className={styles.restoreBanner}>
                  <span className={styles.restoreBannerText}>{s.email}</span>
                  <button
                    className={isA ? styles.discardBtn : styles.restoreBtn}
                    disabled={busy[s.id]}
                    onClick={() => toggle(s.id)}>
                    {busy[s.id] ? '…' : isA ? '✓ Asignado — quitar' : 'Asignar'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <button className={styles.tbBtn} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}
