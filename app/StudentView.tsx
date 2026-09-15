'use client'
import { useCallback, useEffect, useState } from 'react'
import styles from './page.module.css'

// Cara visible de /api/assignments (lado alumno). Solo consume endpoints ya
// scopeados por el backend; la seguridad real vive allá. NO toca captions.
interface AssignedRow {
  videoId: string
  originalName: string
  sharedType: 'pelicula' | 'cancion' | null
  sharedLevel: 'beginner' | 'medium' | 'advance' | null
  active: boolean // false = el admin despublicó el video → "no disponible"
}
interface SharedRow {
  id: string
  originalName: string
  sharedType: 'pelicula' | 'cancion' | null
  sharedLevel: 'beginner' | 'medium' | 'advance' | null
}

const TIPO: Record<string, string> = { pelicula: 'Película', cancion: 'Canción' }
const NIVEL: Record<string, string> = { beginner: 'Beginner', medium: 'Medium', advance: 'Advance' }

export default function StudentView({
  studentId,
  studentEmail,
  onOpenVideo,
}: {
  studentId: string
  studentEmail: string
  onOpenVideo: (videoId: string) => void
}) {
  const [assigned, setAssigned] = useState<AssignedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [shared, setShared] = useState<SharedRow[]>([])
  const [sharedLoading, setSharedLoading] = useState(false)
  const [sharedError, setSharedError] = useState('')
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/assignments?studentId=${encodeURIComponent(studentId)}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAssigned(data.assignments ?? [])
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
  function openPicker() { setPickerOpen(true); if (shared.length === 0) loadShared() }

  const assignedIds = new Set(assigned.map((a) => a.videoId))

  async function toggle(videoId: string, isAssigned: boolean) {
    setBusy((b) => ({ ...b, [videoId]: true }))
    try {
      const res = await fetch('/api/assignments', {
        method: isAssigned ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, videoId }),
      })
      if (!res.ok && !(isAssigned && res.status === 404)) throw new Error()
      await load()
    } catch { setError(isAssigned ? 'No se pudo quitar el material.' : 'No se pudo asignar el material.') }
    finally { setBusy((b) => ({ ...b, [videoId]: false })) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className={styles.dzSub}>Alumno: <strong>{studentEmail}</strong></div>

      {/* ── Material asignado ── */}
      {error && <div className={styles.errorBox}>{error}</div>}
      {loading ? (
        <div className={styles.progSub}>Cargando…</div>
      ) : assigned.length === 0 ? (
        <div className={styles.progSub}>Este alumno todavía no tiene material asignado.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assigned.map((a) => (
            <div key={a.videoId} className={styles.restoreBanner} style={a.active ? undefined : { opacity: 0.55 }}>
              <span className={styles.restoreBannerText}>
                {a.originalName}
                {!a.active && <span className={styles.usersMeta}> · no disponible</span>}
              </span>
              {a.sharedType && <span className={`${styles.chip} ${styles.chipTipo}`}>{TIPO[a.sharedType]}</span>}
              {a.sharedLevel && <span className={`${styles.chip} ${styles.chipNivel}`}>{NIVEL[a.sharedLevel]}</span>}
              <button className={styles.tbBtn} disabled={!a.active} onClick={() => onOpenVideo(a.videoId)}>Abrir</button>
              <button className={styles.discardBtn} disabled={busy[a.videoId]} onClick={() => toggle(a.videoId, true)}>Quitar</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Asignar material ── */}
      {!pickerOpen ? (
        <button className={styles.restoreBtn} onClick={openPicker}>+ Asignar material</button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className={styles.dzSub}>Biblioteca compartida</div>
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
                    <div className={styles.sharedThumb}>{v.sharedType === 'cancion' ? '🎵' : '🎬'}</div>
                    <div className={styles.sharedName}>{v.originalName}</div>
                    <div className={styles.libChips}>
                      {v.sharedType && <span className={`${styles.chip} ${styles.chipTipo}`}>{TIPO[v.sharedType]}</span>}
                      {v.sharedLevel && <span className={`${styles.chip} ${styles.chipNivel}`}>{NIVEL[v.sharedLevel]}</span>}
                    </div>
                    <div>
                      <button
                        className={isA ? styles.discardBtn : styles.restoreBtn}
                        disabled={busy[v.id]}
                        onClick={() => toggle(v.id, isA)}>
                        {busy[v.id] ? '…' : isA ? '✓ Asignado — quitar' : 'Asignar'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <button className={styles.tbBtn} onClick={() => setPickerOpen(false)}>Listo</button>
        </div>
      )}
    </div>
  )
}
