'use client'
import { useEffect, useMemo, useState } from 'react'
import styles from './page.module.css'
import type { SharedType, SharedLevel } from '@/lib/db/schema'
import { TIPO_LABEL, NIVEL_LABEL } from './LibraryList'

interface SharedVideoRow {
  id: string
  originalName: string
  durationSec: number | null
  sharedType: SharedType | null
  sharedLevel: SharedLevel | null
  publishedAt: string | null
  ownerName: string | null
  phraseCount: number
}

// Biblioteca compartida (vista profe, también visible para admin). Solo lectura:
// acá no hay publicar/despublicar/eliminar — eso vive en la vista admin de
// "Mi biblioteca" (y el backend lo rechaza igual para un profe). Se trae el
// listado completo y se filtra client-side, para poder distinguir "no hay nada
// publicado todavía" de "no hay resultados con estos filtros".
export default function SharedLibrary({ onOpen }: { onOpen: (id: string) => void }) {
  const [videos, setVideos] = useState<SharedVideoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [tipo, setTipo] = useState<'all' | SharedType>('all')
  const [nivel, setNivel] = useState<'all' | SharedLevel>('all')

  async function load() {
    setLoading(true); setLoadError('')
    try {
      const res = await fetch('/api/shared-videos')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setVideos(data.videos ?? [])
    } catch {
      setLoadError('No se pudo cargar la biblioteca compartida.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => videos.filter(v =>
    (tipo === 'all' || v.sharedType === tipo) && (nivel === 'all' || v.sharedLevel === nivel)
  ), [videos, tipo, nivel])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className={styles.sharedHint}>
        El material compartido es <b>solo lectura</b>: si editás las captions de un video,
        se guarda tu propia copia — el original queda intacto para el resto de los profes.
      </div>

      <div className={styles.sharedFilters}>
        <div className={styles.sharedFilterGroup}>
          <span>Tipo</span>
          {([['all', 'Todos'], ['pelicula', 'Película'], ['cancion', 'Canción']] as const).map(([val, label]) => (
            <button key={val} type="button"
              className={`${styles.usersFilterChip} ${tipo === val ? styles.usersFilterChipOn : ''}`}
              onClick={() => setTipo(val)}>{label}</button>
          ))}
        </div>
        <div className={styles.sharedFilterGroup}>
          <span>Nivel</span>
          {([['all', 'Todos'], ['beginner', 'Beginner'], ['medium', 'Medium'], ['advance', 'Advance']] as const).map(([val, label]) => (
            <button key={val} type="button"
              className={`${styles.usersFilterChip} ${nivel === val ? styles.usersFilterChipOn : ''}`}
              onClick={() => setNivel(val)}>{label}</button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className={styles.errorBox}>
          {loadError}{' '}
          <button className={styles.tbBtn} onClick={load}>Reintentar</button>
        </div>
      )}

      {loading ? (
        <div className={styles.progSub}>Cargando material…</div>
      ) : videos.length === 0 && !loadError ? (
        <div className={styles.progSub}>
          Todavía no hay material disponible. El administrador publica acá los videos para tus clases.
        </div>
      ) : filtered.length === 0 && !loadError ? (
        <div className={styles.progSub}>No hay videos con estos filtros.</div>
      ) : (
        <div className={styles.sharedGrid}>
          {filtered.map(v => (
            <div key={v.id} className={styles.sharedCard}>
              <div className={styles.sharedThumb}>{v.sharedType === 'cancion' ? '🎵' : '🎬'}</div>
              <div className={styles.sharedName}>{v.originalName}</div>
              <div className={styles.sharedMeta}>
                {v.ownerName ? `de ${v.ownerName} · ` : ''}{v.phraseCount} frases
              </div>
              <div className={styles.libChips}>
                {v.sharedType && <span className={`${styles.chip} ${styles.chipTipo}`}>{TIPO_LABEL[v.sharedType]}</span>}
                {v.sharedLevel && <span className={`${styles.chip} ${styles.chipNivel}`}>{NIVEL_LABEL[v.sharedLevel]}</span>}
              </div>
              <div>
                <button className={styles.restoreBtn} onClick={() => onOpen(v.id)}>Abrir en el player</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
