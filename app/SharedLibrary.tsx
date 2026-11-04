'use client'
import { useEffect, useMemo, useState } from 'react'
import styles from './page.module.css'
import type { SharedType, SharedLevel } from '@/lib/db/schema'
import { TIPO_LABEL, NIVEL_LABEL } from './LibraryList'
import AssignToStudents from './AssignToStudents'
import fs from './folders.module.css'
import { FolderIcon } from './FolderBox'

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
// Rediseño (fase 5): tarjetas con miniatura grande como en el inicio del alumno.
// Carpetas (2026-11): si el admin armó carpetas, el material va agrupado en ellas (un video
// puede estar en varias); lo que no está en ninguna, al final en "Otros videos".
export default function SharedLibrary({ onOpen, assignable }: { onOpen: (id: string) => void; assignable?: boolean }) {
  const [videos, setVideos] = useState<SharedVideoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [tipo, setTipo] = useState<'all' | SharedType>('all')
  const [nivel, setNivel] = useState<'all' | SharedLevel>('all')
  const [assignTarget, setAssignTarget] = useState<{ id: string; name: string } | null>(null)
  const [folders, setFolders] = useState<{ id: string; name: string; videoIds: string[] }[]>([])

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
    try {
      const res = await fetch('/api/folders')
      if (res.ok) setFolders((await res.json()).folders ?? [])
    } catch { /* sin carpetas: se ve todo junto */ }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => videos.filter(v =>
    (tipo === 'all' || v.sharedType === tipo) && (nivel === 'all' || v.sharedLevel === nivel)
  ), [videos, tipo, nivel])

  // Grupos por carpeta (con los filtros aplicados); sin carpetas, un solo grupo sin título.
  const groups = useMemo(() => {
    if (folders.length === 0) return [{ id: 'all', name: null as string | null, list: filtered }]
    const inSome = new Set(folders.flatMap((f) => f.videoIds))
    const byFolder = folders.map((f) => ({ id: f.id, name: f.name as string | null, list: filtered.filter((v) => f.videoIds.includes(v.id)) }))
    const loose = filtered.filter((v) => !inSome.has(v.id))
    return [...byFolder, { id: 'loose', name: 'Otros videos', list: loose }].filter((g) => g.list.length > 0)
  }, [folders, filtered])

  const card = (v: SharedVideoRow) => (
    <div key={v.id} className={styles.sharedCard}>
      <div className={styles.sharedThumb}><svg className={styles.thumbIco} viewBox="0 0 24 24" aria-hidden="true"><polygon points="8 5 19 12 8 19 8 5" fill="currentColor" /></svg></div>
      <div className={styles.sharedName}>{v.originalName}</div>
      <div className={styles.sharedMeta}>
        {v.ownerName ? `De ${v.ownerName}, ` : ''}{v.phraseCount} frases
      </div>
      <div className={styles.libChips}>
        {v.sharedType && <span className={`${styles.chip} ${styles.chipTipo}`}>{TIPO_LABEL[v.sharedType]}</span>}
        {v.sharedLevel && <span className={`${styles.chip} ${styles.chipNivel}`}>{NIVEL_LABEL[v.sharedLevel]}</span>}
      </div>
      <div className={styles.libActions} style={{ marginTop: 4 }}>
        <button className={styles.restoreBtn} onClick={() => onOpen(v.id)}>Abrir en el player</button>
        {assignable && (
          <button className={styles.tbBtn} onClick={() => setAssignTarget({ id: v.id, name: v.originalName })}>Asignar a…</button>
        )}
      </div>
    </div>
  )

  return (
    <div className={styles.stack}>
      <div className={styles.sharedHint}>
        El material compartido es <b>solo lectura</b>: si editás las captions de un video,
        se guarda tu propia copia y el original queda intacto para el resto de los profes.
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
        groups.map((g) => (
          <section key={g.id} aria-label={g.name ?? undefined}>
            {g.name && (
              <h3 className={fs.fName} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 12px' }}>
                <FolderIcon className={fs.fIcon} />{g.name}<span className={fs.fCount}>{g.list.length === 1 ? '1 video' : `${g.list.length} videos`}</span>
              </h3>
            )}
            <div className={styles.sharedGrid}>{g.list.map(card)}</div>
          </section>
        ))
      )}
      {assignTarget && (
        <AssignToStudents
          videoId={assignTarget.id}
          videoName={assignTarget.name}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </div>
  )
}
