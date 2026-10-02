'use client'
// Calendario (C3; G1) — sección "Clases" en la pantalla de un alumno (lado PROFE / ADMIN).
// G1: se crea y se edita como en Google Calendar — "+ Nueva clase" abre una ventana con
// fecha, horario, repetición (uno o varios días), fin y Zoom (ClassDialog). Al editar o
// cancelar una clase que se repite se pregunta "Solo esta / Esta y las siguientes /
// Todas" (ScopeDialog). Todo en hora de Argentina (en la que carga el profe). Solo habla
// con /api/classes/** — quién puede tocar qué lo decide el servidor (lib/classAccess.ts).
// G2: lo de crear/editar/cancelar vive en useClassEditor (lo comparte con "Mi agenda").
// Rediseño (fase 5): sin recuadros ni etiquetas en mayúsculas; filas como en "Hoy", fechas
// con palabras y "Hoy" resaltado en amarillo (el "ahora").
import { useCallback, useEffect, useState } from 'react'
import styles from './classes.module.css'
import { CLASS_TZ, dateInTz } from '@/lib/classSchedule'
import {
  classKind, dayMonthLong, longDate, meetLabel, relativeDay, seriesTitle, timeRange,
  type TeacherClass,
} from '@/lib/classView'
import { EDITOR_TEXTS, useClassEditor, type Series } from './useClassEditor'

export const TEACHER_CLASS_TEXTS = {
  title: 'Clases',
  tzNote: 'Horarios en hora de Argentina',
  add: '+ Nueva clase',
  fixed: 'Se repite todas las semanas',
  noFixed: 'Todavía no tiene clases que se repitan.',
  upcoming: 'Próximas clases',
  none: 'No hay clases agendadas.',
  showing: 'Mostrando las próximas 5 semanas.',
  today: 'Hoy',
  kinds: { fija: 'Se repite', suelta: 'Una vez', movida: 'Cambió de día', cancelada: 'Cancelada' },
  was: (d: string) => `era el ${d}`,
  cancel: 'Cancelar', restore: 'Restaurar', edit: 'Editar',
  room: 'Mi sala de Zoom',
  confirmCancel: EDITOR_TEXTS.confirmCancel,
  loading: 'Cargando clases…',
  loadError: 'No se pudieron cargar las clases.',
  retry: 'Reintentar',
  saveError: EDITOR_TEXTS.saveError,
  minutes: (n: number) => `${n} minutos`,
  via: (label: string) => `en ${label}`,
  since: (d: string) => `desde el ${d}`,
  until: (d: string) => `hasta el ${d}`,
  between: (a: string, b: string) => `del ${a} al ${b}`,
} as const

// De qué es el link de una clase/horario. Sin link propio → "Mi sala de Zoom" (si hay).
const linkLabel = (url: string | null, room: string | null) => (url ? meetLabel(url) : room ? TEACHER_CLASS_TEXTS.room : null)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function TeacherClasses({ studentId }: { studentId: string }) {
  const T = TEACHER_CLASS_TEXTS
  const [data, setData] = useState<{ series: Series[]; classes: TeacherClass[]; zoomUrl: string | null } | null>(null)
  const [loadError, setLoadError] = useState(false)
  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const res = await fetch(`/api/classes?studentId=${encodeURIComponent(studentId)}`)
      if (!res.ok) throw new Error(String(res.status))
      const body = await res.json()
      setData({
        series: Array.isArray(body?.series) ? body.series : [],
        classes: Array.isArray(body?.classes) ? body.classes : [],
        zoomUrl: typeof body?.zoomUrl === 'string' ? body.zoomUrl : null,
      })
    } catch {
      setLoadError(true)
    }
  }, [studentId])
  useEffect(() => { load() }, [load])

  const today = dateInTz(new Date(), CLASS_TZ)
  const now = new Date()
  const editor = useClassEditor({ zoomUrl: data?.zoomUrl ?? null, series: data?.series ?? [], reload: load })
  const busy = editor.busy

  return (
    <section className={styles.tc} aria-label={T.title}>
      <div className={styles.tcHead}>
        <h2 className={styles.tcTitle}>{T.title}</h2>
        <span className={styles.tcNote}>{T.tzNote}</span>
        <span className={styles.tcSp} />
        <button type="button" className={styles.tcPrimary} onClick={() => editor.create(studentId)} disabled={!data}>{T.add}</button>
      </div>

      {loadError && (
        <div className={styles.tcError}>{T.loadError} <button type="button" className={styles.tcBtn} onClick={load}>{T.retry}</button></div>
      )}
      {!data && !loadError && <div className={styles.tcHint}>{T.loading}</div>}

      {data && (
        <>
          <div className={styles.tcBox}>
            <h3 className={styles.tcBoxTitle}>{T.fixed}</h3>
            {data.series.length === 0 && <div className={styles.tcHint}>{T.noFixed}</div>}
            {data.series.map((s) => {
              const link = linkLabel(s.meetUrl, data.zoomUrl)
              const span = s.startsOn > today && s.endsOn ? T.between(dayMonthLong(s.startsOn), dayMonthLong(s.endsOn))
                : s.startsOn > today || !s.endsOn ? T.since(dayMonthLong(s.startsOn)) : T.until(dayMonthLong(s.endsOn))
              return (
                <div key={s.id} className={styles.tcFixed} data-testid="series-row">
                  <div className={styles.tcFixedText}>
                    <b>{seriesTitle(s.weekdays, s.time)}</b>
                    <span className={styles.tcMeta}>{[T.minutes(s.durationMin), span, link && T.via(link)].filter(Boolean).join(', ')}</span>
                  </div>
                  <button type="button" className={styles.tcBtn} onClick={() => editor.editSeries(studentId, s)} disabled={busy}>{T.edit}</button>
                </div>
              )
            })}
          </div>

          <div className={styles.tcBox}>
            <h3 className={styles.tcBoxTitle}>{T.upcoming}</h3>
            {data.classes.length === 0 && <div className={styles.tcHint}>{T.none}</div>}
            <ul className={styles.tcRows}>
              {data.classes.map((c) => {
                const t = new Date(c.startsAt)
                const kind = classKind(c)
                const rel = relativeDay(t, now, CLASS_TZ)
                const link = kind === 'suelta' ? linkLabel(c.meetUrl, data.zoomUrl) : null
                return (
                  <li key={c.key} className={styles.tcRowWrap}>
                    <div className={`${styles.tcRow} ${kind === 'cancelada' ? styles.tcCanc : ''}`} data-testid="class-row">
                      <span className={styles.tcD}>
                        {rel === 'Hoy' && kind !== 'cancelada' ? <><mark className={styles.tcNow}>{T.today}</mark> </> : rel ? `${rel} ` : ''}
                        {rel ? longDate(t, CLASS_TZ) : cap(longDate(t, CLASS_TZ))}
                      </span>
                      <span className={styles.tcH}>{timeRange(t, c.durationMin, CLASS_TZ)}</span>
                      <span className={`${styles.tcKind} ${styles['k_' + kind]}`}>
                        {T.kinds[kind]}
                        {kind === 'movida' && c.originalStartsAt ? `, ${T.was(longDate(new Date(c.originalStartsAt), CLASS_TZ))}` : ''}
                        {link ? `, ${T.via(link)}` : ''}
                      </span>
                      <span className={styles.tcActs}>
                        {kind !== 'cancelada' && <>
                          <button type="button" className={styles.tcBtn} disabled={busy} onClick={() => editor.edit(studentId, c)}>{T.edit}</button>
                          <button type="button" className={styles.tcDanger} onClick={() => editor.cancel(studentId, c)} disabled={busy}>{T.cancel}</button>
                        </>}
                        {kind === 'cancelada' && (
                          <button type="button" className={styles.tcBtn} onClick={() => editor.restore(c)} disabled={busy}>{T.restore}</button>
                        )}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
            {data.classes.length > 0 && <div className={styles.tcHint}>{T.showing}</div>}
          </div>
          {editor.error && !editor.isOpen && <div role="alert" className={styles.tcError}>{editor.error}</div>}
        </>
      )}
      {editor.dialog}
    </section>
  )
}
