'use client'
// Elegir material (2026-11): ventana para asignarle videos a un alumno o meterlos en una
// carpeta de la biblioteca. Buscar por nombre, filtrar por tipo y nivel, tildar varios y
// confirmar una sola vez ("Asignar 3 videos"). Lo que ya está se ve tildado y gris. El
// destino (la carpeta) se elige abajo, al lado del botón: queda claro DÓNDE va a parar.
import { useMemo, useState, type ReactNode } from 'react'
import styles from './material.module.css'
import { Modal } from './ClassDialog'
import { NIVEL_LABEL, TIPO_LABEL } from '@/lib/materialView'

export type PickVideo = {
  id: string
  name: string
  type?: 'pelicula' | 'cancion' | null
  level?: 'beginner' | 'medium' | 'advance' | null
  /** Línea chica debajo del nombre (ej. "Privado: los profes no lo ven"). */
  note?: string | null
}

export const PICKER_TEXTS = {
  search: 'Buscar material',
  all: 'Todos',
  type: 'Tipo', level: 'Nivel',
  selected: (n: number) => (n === 1 ? '1 seleccionado' : `${n} seleccionados`),
  none: 'No hay videos con esa búsqueda.',
  cancel: 'Cancelar',
  loading: 'Cargando material…',
  retry: 'Reintentar',
} as const

export default function MaterialPicker({
  title, videos, already, alreadyLabel, loading = false, error = '', onRetry, emptyText, footer, confirmLabel, onConfirm, onClose,
}: {
  title: string
  videos: PickVideo[]
  /** Los que ya están (se ven tildados y no se pueden elegir). */
  already: Set<string>
  alreadyLabel: string
  loading?: boolean
  error?: string
  onRetry?: () => void
  emptyText: string
  /** Lo que va a la izquierda del botón (el destino). */
  footer?: ReactNode
  confirmLabel: (n: number) => string
  onConfirm: (ids: string[]) => Promise<string | null>
  onClose: () => void
}) {
  const T = PICKER_TEXTS
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState<'all' | 'pelicula' | 'cancion'>('all')
  const [nivel, setNivel] = useState<'all' | 'beginner' | 'medium' | 'advance'>('all')
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')

  const hasTypes = videos.some((v) => v.type)
  const hasLevels = videos.some((v) => v.level)
  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('es')
    // Lo que todavía se puede elegir, primero; lo que ya está, al final.
    return videos.filter((v) =>
      (!needle || v.name.toLocaleLowerCase('es').includes(needle)) &&
      (tipo === 'all' || v.type === tipo) && (nivel === 'all' || v.level === nivel))
      .sort((a, b) => Number(already.has(a.id)) - Number(already.has(b.id)))
  }, [videos, q, tipo, nivel, already])

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  async function confirm() {
    if (picked.length === 0) return
    setBusy(true); setSaveError('')
    const e = await onConfirm(picked)
    setBusy(false)
    if (e) setSaveError(e)
  }

  return (
    <Modal label={title} onClose={onClose} wide>
      <div className={styles.pkHead}>
        <h3 className={styles.pkTitle}>{title}</h3>
        <button type="button" className={styles.pkX} onClick={onClose} aria-label={T.cancel}>×</button>
      </div>
      <input data-autofocus className={styles.search} type="search" placeholder={T.search} aria-label={T.search}
        value={q} onChange={(e) => setQ(e.target.value)} />
      {(hasTypes || hasLevels) && (
        <div className={styles.pkFilters}>
          {hasTypes && (
            <div className={styles.chips} role="group" aria-label={T.type}>
              {(['all', 'pelicula', 'cancion'] as const).map((t) => (
                <button key={t} type="button" aria-pressed={tipo === t} className={`${styles.chip} ${tipo === t ? styles.chipOn : ''}`}
                  onClick={() => setTipo(t)}>{t === 'all' ? T.all : TIPO_LABEL[t]}</button>
              ))}
            </div>
          )}
          {hasLevels && (
            <div className={styles.chips} role="group" aria-label={T.level}>
              {(['all', 'beginner', 'medium', 'advance'] as const).map((n) => (
                <button key={n} type="button" aria-pressed={nivel === n} className={`${styles.chip} ${nivel === n ? styles.chipOn : ''}`}
                  onClick={() => setNivel(n)}>{n === 'all' ? T.all : NIVEL_LABEL[n]}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={styles.pkList} role="group" aria-label={title}>
        {error ? (
          <div className={styles.err} role="alert">{error} {onRetry && <button type="button" className={styles.linkBtn} onClick={onRetry}>{T.retry}</button>}</div>
        ) : loading ? (
          <p className={styles.muted}>{T.loading}</p>
        ) : videos.length === 0 ? (
          <p className={styles.muted}>{emptyText}</p>
        ) : list.length === 0 ? (
          <p className={styles.muted}>{T.none}</p>
        ) : list.map((v) => {
          const isIn = already.has(v.id)
          const on = isIn || picked.includes(v.id)
          return (
            <label key={v.id} className={`${styles.pkRow} ${on && !isIn ? styles.pkRowOn : ''} ${isIn ? styles.pkRowIn : ''}`}>
              <input type="checkbox" className={styles.check} checked={on} disabled={isIn} onChange={() => toggle(v.id)} />
              <span className={styles.thumb} aria-hidden="true"><PlayIcon /></span>
              <span className={styles.vName}>
                <b>{v.name}</b>
                <span className={styles.vMeta}>
                  {v.type && <span className={styles.tag}>{TIPO_LABEL[v.type]}</span>}
                  {v.level && <span className={styles.tag}>{NIVEL_LABEL[v.level]}</span>}
                  {v.note && <span>{v.note}</span>}
                  {isIn && <span className={styles.inLabel}>{alreadyLabel}</span>}
                </span>
              </span>
            </label>
          )
        })}
      </div>

      {saveError && <div className={styles.err} role="alert">{saveError}</div>}
      <div className={styles.pkFoot}>
        <div className={styles.pkDest}>{footer}</div>
        <span className={styles.muted}>{picked.length > 0 && T.selected(picked.length)}</span>
        <button type="button" className={styles.btn} onClick={onClose}>{T.cancel}</button>
        <button type="button" className={`${styles.btn} ${styles.btnPri}`} disabled={picked.length === 0 || busy} onClick={confirm}>
          {busy ? '…' : confirmLabel(picked.length)}
        </button>
      </div>
    </Modal>
  )
}

export const PlayIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="8 5 19 12 8 19 8 5" fill="currentColor" /></svg>
export const FolderGlyph = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)
