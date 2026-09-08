'use client'
import { useState } from 'react'
import styles from './page.module.css'
import type { Role, SharedType, SharedLevel } from '@/lib/db/schema'

export interface LibraryVideoRow {
  id: string
  originalName: string
  status: string
  phraseCount: number
  sharedType: SharedType | null
  sharedLevel: SharedLevel | null
  publishedAt: string | null
}

export const TIPO_LABEL: Record<SharedType, string> = { pelicula: 'Película', cancion: 'Canción' }
export const NIVEL_LABEL: Record<SharedLevel, string> = { beginner: 'Beginner', medium: 'Medium', advance: 'Advance' }

// Vista admin de "Mi biblioteca": publicar/despublicar/editar clasificación por
// fila. Solo el admin ve los controles (un profe no puede publicar; el backend
// además lo rechaza server-side). Consume /api/videos/[id]/share; onChanged
// refetchea el listado del padre.
export default function LibraryList({ videos, role, onOpen, onDelete, onChanged }: {
  videos: LibraryVideoRow[]
  role: Role | null
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onChanged: () => void
}) {
  const isAdmin = role === 'admin'
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tipo, setTipo] = useState<SharedType | ''>('')
  const [nivel, setNivel] = useState<SharedLevel | ''>('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<LibraryVideoRow | null>(null)
  const [error, setError] = useState('')

  function openForm(v: LibraryVideoRow) {
    setEditingId(v.id); setTipo(v.sharedType ?? ''); setNivel(v.sharedLevel ?? ''); setError('')
  }
  function closeForm() { setEditingId(null); setTipo(''); setNivel('') }

  async function savePublish(v: LibraryVideoRow) {
    if (!tipo || !nivel) { setError('Elegí tipo y nivel.'); return }
    setBusyId(v.id); setError('')
    try {
      const publishing = !v.publishedAt
      const res = await fetch(`/api/videos/${v.id}/share`, {
        method: publishing ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharedType: tipo, sharedLevel: nivel }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'No se pudo publicar.')
        return
      }
      closeForm(); onChanged()
    } catch { setError('Error de red.') } finally { setBusyId(null) }
  }

  async function unpublish(v: LibraryVideoRow) {
    setBusyId(v.id); setError('')
    try {
      const res = await fetch(`/api/videos/${v.id}/share`, { method: 'DELETE' })
      if (!res.ok) { setError('No se pudo despublicar.'); return }
      onChanged()
    } catch { setError('Error de red.') } finally { setBusyId(null) }
  }

  // Borrar un publicado pide confirmación: se lo saca a los profes que lo usan.
  function askDelete(v: LibraryVideoRow) {
    if (v.publishedAt) setConfirmDel(v)
    else onDelete(v.id)
  }

  return (
    <div style={{ width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {error && <div className={styles.errorBox}>{error}</div>}
      {videos.map(v => {
        const published = !!v.publishedAt
        const expired = v.status === 'expired'
        return (
          <div key={v.id} className={`${styles.restoreBanner} ${published ? styles.rowPub : ''}`}>
            <span className={styles.restoreBannerText}>
              {v.originalName} — {v.phraseCount} frases{expired ? ' · expirado' : ''}
            </span>
            <div className={styles.libChips}>
              {isAdmin && (published
                ? <span className={`${styles.chip} ${styles.chipPub}`}><span className={styles.libDot} />Publicado</span>
                : <span className={`${styles.chip} ${styles.chipPriv}`}>Privado</span>)}
              {published && v.sharedType && <span className={`${styles.chip} ${styles.chipTipo}`}>{TIPO_LABEL[v.sharedType]}</span>}
              {published && v.sharedLevel && <span className={`${styles.chip} ${styles.chipNivel}`}>{NIVEL_LABEL[v.sharedLevel]}</span>}
            </div>
            <div className={styles.libActions}>
              {isAdmin && !published && <button className={styles.restoreBtn} disabled={expired} onClick={() => openForm(v)}>Publicar</button>}
              {isAdmin && published && <button className={styles.tbBtn} onClick={() => openForm(v)}>Editar</button>}
              {isAdmin && published && <button className={styles.discardBtn} disabled={busyId === v.id} onClick={() => unpublish(v)}>Despublicar</button>}
              <button className={styles.restoreBtn} disabled={expired} onClick={() => onOpen(v.id)}>Abrir</button>
              <button className={styles.discardBtn} onClick={() => askDelete(v)}>Eliminar</button>
            </div>
            {editingId === v.id && (
              <div className={styles.libForm}>
                <div className={styles.libFld}>
                  <label>Tipo</label>
                  <select className={styles.usersInput} value={tipo} onChange={e => setTipo(e.target.value as SharedType | '')}>
                    <option value="">— elegir —</option>
                    <option value="pelicula">Película</option>
                    <option value="cancion">Canción</option>
                  </select>
                </div>
                <div className={styles.libFld}>
                  <label>Nivel</label>
                  <select className={styles.usersInput} value={nivel} onChange={e => setNivel(e.target.value as SharedLevel | '')}>
                    <option value="">— elegir —</option>
                    <option value="beginner">Beginner</option>
                    <option value="medium">Medium</option>
                    <option value="advance">Advance</option>
                  </select>
                </div>
                <button className={styles.restoreBtn} disabled={busyId === v.id} onClick={() => savePublish(v)}>
                  {busyId === v.id ? 'Guardando…' : (published ? 'Guardar' : 'Publicar a la compartida')}
                </button>
                <button className={styles.discardBtn} onClick={closeForm}>Cancelar</button>
              </div>
            )}
          </div>
        )
      })}

      {/* Aviso al eliminar un publicado. Orden deliberado: la opción segura
          (Despublicar) es la primaria; la destructiva va segunda y neutra. */}
      {confirmDel && (
        <div className={styles.exitOverlay} onClick={() => setConfirmDel(null)}>
          <div className={styles.exitDialog} onClick={e => e.stopPropagation()}>
            <div className={styles.exitTitle}>“{confirmDel.originalName}” está publicado en la biblioteca compartida</div>
            <div className={styles.progSub}>
              Si lo eliminás, se lo sacás a los profesores que lo estén usando en sus clases.
              Podés despublicarlo en vez de borrarlo: sale de la compartida pero no perdés el video.
            </div>
            <button className={styles.exitBtnPrimary} onClick={() => { const v = confirmDel; setConfirmDel(null); unpublish(v) }}>
              Despublicar (recomendado)
            </button>
            <button className={styles.exitBtn} onClick={() => { const id = confirmDel.id; setConfirmDel(null); onDelete(id) }}>
              Eliminar igual — los profes lo pierden
            </button>
            <button className={styles.exitBtnCancel} onClick={() => setConfirmDel(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
