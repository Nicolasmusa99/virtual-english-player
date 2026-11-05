'use client'
import { useEffect, useMemo, useState } from 'react'
import ms from './material.module.css'
import { Modal } from './ClassDialog'
import Avatar from './Avatar'

// Video-centric: dado un video, a qué alumnos MÍOS está asignado. Cruza GET /api/users
// (alumnos) con GET /api/assignments (para saber cuáles ya lo tienen). Solo endpoints
// scopeados; el backend rechaza fuera de alcance. Cada toggle persiste al instante (no hay
// "guardar"), así que cerrar no pierde nada.
// Rediseño 2026-11: la ventana del aula, con buscador y cada alumno con su avatar. Va sin
// carpeta: para ordenarlo, está la pantalla del alumno.
interface StudentRow { id: string; name?: string | null; email: string | null; role: string | null; image?: string | null }

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
  const [q, setQ] = useState('')

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

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return students.filter((s) => !needle || `${s.name ?? ''} ${s.email ?? ''}`.toLowerCase().includes(needle))
  }, [students, q])
  const title = `Asignar “${videoName}”`

  return (
    <Modal label={title} onClose={onClose}>
      <div className={ms.pkHead}>
        <h3 className={ms.pkTitle}>{title}</h3>
        <button type="button" className={ms.pkX} onClick={onClose} aria-label="Cerrar">×</button>
      </div>
      {students.length > 5 && (
        <input data-autofocus className={ms.search} type="search" placeholder="Buscar alumno" aria-label="Buscar alumno"
          value={q} onChange={(e) => setQ(e.target.value)} />
      )}
      {error && <div className={ms.err} role="alert">{error}</div>}
      <div className={ms.pkList}>
        {loading ? (
          <p className={ms.muted}>Cargando alumnos…</p>
        ) : students.length === 0 ? (
          <p className={ms.muted}>No tenés alumnos todavía.</p>
        ) : list.length === 0 ? (
          <p className={ms.muted}>No hay alumnos con esa búsqueda.</p>
        ) : list.map((s) => {
          const isA = assignedTo.has(s.id)
          return (
            <div key={s.id} className={`${ms.pkRow} ${isA ? ms.pkRowOn : ''}`} style={{ cursor: 'default' }}>
              <Avatar id={s.id} name={s.name} email={s.email} image={s.image} />
              <span className={ms.vName}>
                <b>{s.name || s.email}</b>
                {s.name && s.email && <span className={ms.vMeta}>{s.email}</span>}
              </span>
              {isA && <span className={ms.inLabel}>Asignado</span>}
              <button type="button" className={`${ms.btn} ${ms.btnSm} ${isA ? '' : ms.btnPri}`} disabled={busy[s.id]} onClick={() => toggle(s.id)}>
                {busy[s.id] ? '…' : isA ? 'Quitar' : 'Asignar'}
              </button>
            </div>
          )
        })}
      </div>
      <div className={ms.pkFoot}>
        <span className={ms.sp} />
        <button type="button" className={ms.btn} onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  )
}
