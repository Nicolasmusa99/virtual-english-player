'use client'
// Calendario (C3) — "Tus clases" en el inicio del ALUMNO: la próxima clase (con el botón
// para entrar) + las siguientes + "Ver el mes". Solo habla con /api/student/classes (el
// servidor scopea al alumno de la sesión y su profe actual). Las horas se muestran en la
// zona del DISPOSITIVO; si no es la de Argentina, se avisa "tu hora local".
// Rediseño (fase 4): la próxima clase con la hora grande y "Hoy" resaltado en amarillo
// (el "ahora"); las siguientes en filas, sin etiquetas en mayúsculas.
import { useCallback, useEffect, useState } from 'react'
import styles from './student.module.css'
import {
  classLengthNote, deviceTz, differsFromClassTz, hhmm, longDate, meetLabel, nextClassDay, splitUpcoming, timeRange,
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
  minutes: (n: number) => `${n} min`,
  cancelled: 'Cancelada',
  moved: 'Cambió de día',
  seeMonth: 'Ver el mes',
  empty: 'Todavía no tenés clases agendadas.',
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

// Botón "Entrar": abre el link en otra pestaña ("Entrar a Zoom" si es de Zoom). Sin link → aviso.
export function EnterButton({ url, compact }: { url: string | null; compact?: boolean }) {
  if (!url) return <span className={styles.clNoLink}>{CLASSES_TEXTS.noLink}</span>
  return (
    <a className={`${styles.clEnter} ${compact ? styles.clEnterSm : ''}`} href={url} target="_blank" rel="noopener noreferrer">
      {meetLabel(url) === 'Zoom' ? CLASSES_TEXTS.enterZoom : CLASSES_TEXTS.enter}
    </a>
  )
}
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; classes: StudentClass[] }

export default function StudentClasses({ onOpenMonth }: { onOpenMonth: () => void }) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const res = await fetch('/api/student/classes')
      if (!res.ok) throw new Error(String(res.status))
      setState({ kind: 'ok', classes: toStudentClasses(await res.json()) })
    } catch {
      setState({ kind: 'error' })
    }
  }, [])
  useEffect(() => { load() }, [load])

  const tz = deviceTz()
  const now = new Date()

  return (
    <section className={styles.clSection} aria-label={CLASSES_TEXTS.title}>
      <h2 className={styles.sTitle}>{CLASSES_TEXTS.title}</h2>

      {state.kind === 'loading' && <p role="status" className={styles.opening}>{CLASSES_TEXTS.loading}</p>}

      {state.kind === 'error' && (
        <p className={styles.clMsg}>
          {CLASSES_TEXTS.error}{' '}
          <button type="button" className={styles.clLinkBtn} onClick={load}>{CLASSES_TEXTS.retry}</button>
        </p>
      )}

      {state.kind === 'ok' && (() => {
        const { next, rest } = splitUpcoming(state.classes, now)
        if (!next && rest.length === 0) return <p className={styles.clMsg}>{CLASSES_TEXTS.empty}</p>
        const t = next ? new Date(next.startsAt) : null
        const when = t ? nextClassDay(t, now, tz) : null
        return (
          <>
            {next && t && when && (
              <div className={styles.clNext} data-testid="next-class">
                <div className={styles.clWhenBox}>
                  <div className={styles.clDay}>
                    {when.rel === 'Hoy' ? <mark className={styles.now}>{when.rel}</mark> : when.rel && <b>{when.rel}</b>} {when.day}
                  </div>
                  <div className={styles.clTime}>{hhmm(t, tz)}</div>
                </div>
                <div className={styles.clInfo}>
                  <div className={styles.clLbl}>{CLASSES_TEXTS.next}</div>
                  <div className={styles.clMeta}>{classLengthNote(next.durationMin, next.meetUrl)}</div>
                  {next.moved && <div className={styles.clMoved}>{CLASSES_TEXTS.moved}</div>}
                  {differsFromClassTz(t, tz) && <div className={styles.clTz}>{CLASSES_TEXTS.localTime}</div>}
                </div>
                <EnterButton url={next.meetUrl} />
              </div>
            )}

            {rest.length > 0 && (
              <ul className={styles.clList}>
                {rest.map((c) => {
                  const ct = new Date(c.startsAt)
                  const canc = c.status === 'cancelled'
                  return (
                    <li key={c.key} className={`${styles.clRow} ${canc ? styles.clRowCanc : ''}`}>
                      <span className={styles.clRowDate}>{cap(longDate(ct, tz))}</span>
                      <span className={styles.clRowTime}>{timeRange(ct, c.durationMin, tz)}</span>
                      {canc && <span className={styles.clNoteCanc}>{CLASSES_TEXTS.cancelled}</span>}
                      {!canc && c.moved && <span className={styles.clNote}>{CLASSES_TEXTS.moved}</span>}
                    </li>
                  )
                })}
              </ul>
            )}

            <button type="button" className={styles.clMonthBtn} onClick={onOpenMonth}>{CLASSES_TEXTS.seeMonth}</button>
          </>
        )
      })()}
    </section>
  )
}
