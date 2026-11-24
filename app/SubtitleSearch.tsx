'use client'
// Ventana "Buscar subtítulos" (2026-11-24). Busca subtítulos hechos por personas: canciones
// (LRCLIB) y películas o series (OpenSubtitles), por el nombre del video, que se puede
// corregir. Se usa:
//   · al subir un video, ANTES de transcribir (con "Transcribir con IA" como alternativa;
//     si no encuentra nada sigue solo con la IA), y
//   · en el player, desde "Más" → "Buscar subtítulos", para reemplazar los que hay.
// Habla con /api/subtitles/search y /api/subtitles/download.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import styles from './classes.module.css'
import { Modal } from './ClassDialog'
import { parseSRT } from '@/lib/srt'
import type { SubResult } from '@/lib/subtitleSearch'

const fmtDur = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '')

export default function SubtitleSearch({ initialQuery, durationSec, onPick, onClose, onAi, autoAiWhenEmpty }: {
  initialQuery: string
  durationSec?: number
  onPick: (srt: string, label: string) => void
  onClose: () => void
  /** "Transcribir con IA" (solo al subir un video). */
  onAi?: () => void
  /** Si la primera búsqueda no encuentra nada, seguir directo con la IA. */
  autoAiWhenEmpty?: boolean
}) {
  const [q, setQ] = useState(initialQuery)
  const [busy, setBusy] = useState(false)
  const [songs, setSongs] = useState<SubResult[]>([])
  const [movies, setMovies] = useState<SubResult[]>([])
  const [searched, setSearched] = useState(false)
  const [getting, setGetting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const first = useRef(true)

  async function search(query: string) {
    if (!query.trim()) return
    setBusy(true); setError('')
    try {
      const params = new URLSearchParams({ q: query })
      if (durationSec && isFinite(durationSec)) params.set('duration', String(Math.round(durationSec)))
      const res = await fetch(`/api/subtitles/search?${params}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'No se pudo buscar')
      const s = (data?.songs ?? []) as SubResult[], m = (data?.movies ?? []) as SubResult[]
      setSongs(s); setMovies(m); setSearched(true)
      if (first.current && autoAiWhenEmpty && onAi && !s.length && !m.length) onAi()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar')
      if (first.current && autoAiWhenEmpty && onAi) onAi()
    } finally {
      first.current = false
      setBusy(false)
    }
  }
  useEffect(() => { search(initialQuery) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(r: SubResult) {
    setGetting(`${r.source}:${r.id}`); setError('')
    try {
      const res = await fetch('/api/subtitles/download', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: r.source, id: r.id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || typeof data?.srt !== 'string') throw new Error(data?.error || 'No se pudo bajar el subtítulo')
      if (!parseSRT(data.srt).length) throw new Error('Ese subtítulo vino vacío. Probá con otro.')
      onPick(data.srt, r.kind === 'song' ? 'Letra de LRCLIB' : 'OpenSubtitles')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo bajar el subtítulo')
    } finally {
      setGetting(null)
    }
  }

  function submit(e: FormEvent) { e.preventDefault(); search(q) }

  const row = (r: SubResult) => {
    const key = `${r.source}:${r.id}`
    return (
      <li key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--tiza)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: 'var(--tinta)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
          <div className={styles.tcHint} style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[r.detail, fmtDur(r.durationSec)].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button type="button" className={styles.tcBtn} disabled={getting !== null} onClick={() => pick(r)}>
          {getting === key ? 'Bajando…' : 'Usar'}
        </button>
      </li>
    )
  }

  return (
    <Modal label="Buscar subtítulos" onClose={onClose} wide>
      <h3 className={styles.cdTitle}>Buscar subtítulos</h3>
      <p className={styles.tcHint} style={{ margin: '0 0 12px' }}>
        Subtítulos hechos por personas para canciones y películas. Son más precisos que los de la IA.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
        <input data-autofocus className={styles.cdInput} style={{ flex: 1 }} value={q} maxLength={120} autoComplete="off"
          aria-label="Qué buscar" onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className={styles.tcBtn} disabled={busy}>{busy ? 'Buscando…' : 'Buscar'}</button>
      </form>
      {error && <div role="alert" className={styles.tcError} style={{ marginTop: 10 }}>{error}</div>}
      {searched && !busy && (
        <div style={{ marginTop: 12, maxHeight: '50vh', overflowY: 'auto' }}>
          {songs.length > 0 && (<><div className={styles.cdLbl} style={{ marginTop: 6 }}>Canciones</div><ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{songs.map(row)}</ul></>)}
          {movies.length > 0 && (<><div className={styles.cdLbl} style={{ marginTop: 12 }}>Películas y series</div><ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{movies.map(row)}</ul></>)}
          {!songs.length && !movies.length && <p className={styles.tcHint}>No encontré nada con ese nombre. Probá escribirlo distinto (por ejemplo, artista y canción).</p>}
        </div>
      )}
      <p className={styles.tcHint} style={{ margin: '12px 0 0', fontSize: 13 }}>
        Si quedan corridos, ajustalos con "Desfase de subtítulos" en Ajustes.
      </p>
      <div className={styles.cdBtns}>
        <button type="button" className={styles.tcBtn} onClick={onClose} disabled={getting !== null}>Cancelar</button>
        {onAi && <button type="button" className={styles.tcPrimary} onClick={onAi} disabled={getting !== null}>Transcribir con IA</button>}
      </div>
    </Modal>
  )
}
