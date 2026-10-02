'use client'
// Calendario (C3) — "Tu próxima clase" en el inicio del ALUMNO. Solo habla con
// /api/student/classes (el servidor scopea al alumno de la sesión y su profe actual). Las
// horas se muestran en la zona del DISPOSITIVO; si no es la de Argentina, se avisa "tu hora
// local".
// Rediseño (fase 4): la hora grande y "Hoy" resaltado en amarillo (el "ahora").
// Vista del alumno v2: la tarjeta dice con quién y por dónde ("con Laura Sosa, por Zoom") y
// cuánto falta; abajo, las 3 siguientes y "Ver el calendario". Las clases las carga
// useStudentClasses en StudentApp (decide el armado del inicio); `wide` = sin material, la
// clase es lo principal (la tarjeta y las siguientes, una al lado de la otra).
import { useCallback, useEffect, useState } from 'react'
import styles from './student.module.css'
import {
  classWithLine, deviceTz, differsFromClassTz, hhmm, longDate, meetLabel, nextClassDay, splitUpcoming, startsIn,
} from '@/lib/classView'

export type StudentClass = {
  key: string
  startsAt: string
  durationMin: number
  meetUrl: string | null
  status: 'scheduled' | 'cancelled'
  moved: boolean
}

export const CLASSES_TEXTS = {
  title: 'Tus clases',
  next: 'Tu próxima clase',
  enter: 'Entrar a la clase',
  enterZoom: 'Entrar a Zoom',
  noLink: 'Tu profe todavía no cargó el link',
  cancelled: 'Cancelada',
  moved: 'Cambió de día',
  seeCalendar: 'Ver el calendario',
  emptyTitle: 'No tenés clases agendadas',
  emptySub: 'Cuando tu profe agende una, la vas a ver acá y en el calendario.',
  loading: 'Cargando tus clases…',
  error: 'No pudimos cargar tus clases.',
  retry: 'Reintentar',
  localTime: 'Horarios en tu hora local',
} as const

// Lo que llega de la API, validado: lo que no tenga la forma esperada se descarta.
export function toStudentClasses(body: unknown): StudentClass[] {
  const raw = (body as { classes?: unknown })?.classes
  if (!Array.isArray(raw)) return []
  return raw.filter((c): c is StudentClass =>
    !!c && typeof c.key === 'string' && typeof c.startsAt === 'string' && !isNaN(new Date(c.startsAt).getTime()) &&
    typeof c.durationMin === 'number' && (c.status === 'scheduled' || c.status === 'cancelled') &&
    (c.meetUrl === null || typeof c.meetUrl === 'string'))
    .map((c) => ({ ...c, moved: c.moved === true }))
}

// El nombre de SU profe ("con Laura Sosa"), si llegó.
export function toTeacherName(body: unknown): string | null {
  const n = (body as { teacherName?: unknown })?.teacherName
  return typeof n === 'string' && n.trim() ? n.trim() : null
}

export type ClassesState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ok'; classes: StudentClass[]; teacherName: string | null }

// Las próximas clases del alumno (sin rango: desde hace 2 h, 35 días).
export function useStudentClasses() {
  const [state, setState] = useState<ClassesState>({ kind: 'loading' })
  const reload = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const res = await fetch('/api/student/classes')
      if (!res.ok) throw new Error(String(res.status))
      const body = await res.json()
      setState({ kind: 'ok', classes: toStudentClasses(body), teacherName: toTeacherName(body) })
    } catch {
      setState({ kind: 'error' })
    }
  }, [])
  useEffect(() => { reload() }, [reload])
  return { state, reload }
}

// ¿Tiene alguna clase por delante? (sin ninguna, el inicio lo dice en vez de la tarjeta)
export function hasUpcoming(classes: StudentClass[], now: Date): boolean {
  const { next, rest } = splitUpcoming(classes, now)
  return !!next || rest.length > 0
}

// Botón "Entrar": abre el link en otra pestaña ("Entrar a Zoom" si es de Zoom). Sin link → aviso.
export function EnterButton({ url, compact, block }: { url: string | null; compact?: boolean; block?: boolean }) {
  if (!url) return <span className={`${styles.clNoLink} ${block ? styles.clBlock : ''}`}>{CLASSES_TEXTS.noLink}</span>
  return (
    <a className={`${styles.clEnter} ${compact ? styles.clEnterSm : ''} ${block ? styles.clBlock : ''}`} href={url} target="_blank" rel="noopener noreferrer">
      {meetLabel(url) === 'Zoom' ? CLASSES_TEXTS.enterZoom : CLASSES_TEXTS.enter}
    </a>
  )
}
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)

export default function StudentClasses({ state, now, wide, onRetry, onOpenCalendar }: {
  state: ClassesState
  now: Date
  wide?: boolean
  onRetry: () => void
  onOpenCalendar: () => void
}) {
  const T = CLASSES_TEXTS
  const tz = deviceTz()

  if (state.kind !== 'ok') {
    return (
      <section className={styles.cl} aria-label={T.title}>
        <h2 className={styles.sTitle}>{T.title}</h2>
        {state.kind === 'loading'
          ? <p role="status" className={styles.opening}>{T.loading}</p>
          : <p className={styles.clMsg}>{T.error}{' '}<button type="button" className={styles.clLinkBtn} onClick={onRetry}>{T.retry}</button></p>}
      </section>
    )
  }

  const { next, rest } = splitUpcoming(state.classes, now, 3)
  if (!next && rest.length === 0) {
    return (
      <section className={styles.cl} aria-label={T.title}>
        <h2 className={styles.sTitle}>{T.title}</h2>
        <div className={styles.empty}>
          <div className={styles.emTitle}>{T.emptyTitle}</div>
          <div className={styles.emSub}>{T.emptySub}</div>
        </div>
      </section>
    )
  }

  const t = next ? new Date(next.startsAt) : null
  const when = t ? nextClassDay(t, now, tz) : null
  const withLine = next ? classWithLine(state.teacherName, next.meetUrl) : ''
  const count = next && t ? startsIn(t, next.durationMin, now) : null

  return (
    <section className={`${styles.cl} ${wide ? styles.clWide : ''}`} aria-label={T.title}>
      <h2 className={styles.sTitle}>{next ? T.next : T.title}</h2>
      <div className={styles.clGrid}>
        {next && t && when && (
          <div className={styles.clNext} data-testid="next-class">
            <div className={styles.clDay}>
              {when.rel === 'Hoy' ? <mark className={styles.now}>{when.rel}</mark> : when.rel && <b>{when.rel}</b>} {when.day}
            </div>
            <div className={styles.clTime}>{hhmm(t, tz)}</div>
            {withLine && <div className={styles.clWith}>{withLine}</div>}
            {count && <div className={styles.clCount}>{count}</div>}
            {next.moved && <div className={styles.clMoved}>{T.moved}</div>}
            {differsFromClassTz(t, tz) && <div className={styles.clTz}>{T.localTime}</div>}
            <EnterButton url={next.meetUrl} block />
          </div>
        )}
        <div className={styles.clMore}>
          {rest.length > 0 && (
            <ul className={styles.clList}>
              {rest.map((c) => {
                const ct = new Date(c.startsAt)
                const canc = c.status === 'cancelled'
                return (
                  <li key={c.key} className={`${styles.clRow} ${canc ? styles.clRowCanc : ''}`}>
                    <span className={styles.clRowDate}>{cap(longDate(ct, tz))}</span>
                    <span className={styles.clRowTime}>{hhmm(ct, tz)}</span>
                    {canc && <span className={styles.clNoteCanc}>{T.cancelled}</span>}
                    {!canc && c.moved && <span className={styles.clNote}>{T.moved}</span>}
                  </li>
                )
              })}
            </ul>
          )}
          <button type="button" className={styles.clCalBtn} onClick={onOpenCalendar}>{T.seeCalendar}</button>
        </div>
      </div>
    </section>
  )
}
