'use client'
// Rediseño (fase 2) — "Hoy": el inicio del PROFE. Sus clases del día en orden, con la
// raya amarilla de "ahora" entre las que pasaron y las que vienen; la próxima con
// "Entrar a Zoom". Al costado, la semana en corto. Crear / editar / restaurar usan las
// mismas ventanas que la agenda (useClassEditor). Todo en hora de Argentina.
import { Fragment, useEffect, useMemo, useState } from 'react'
import styles from './aula.module.css'
import { AulaPage } from './AulaShell'
import ZoomRoomStatus from './ZoomRoomStatus'
import { useClassEditor } from './useClassEditor'
import { useWeekAgenda, type AgendaClass } from './useWeekAgenda'
import { CLASS_TZ, dateInTz } from '@/lib/classSchedule'
import { classKind, hhmm, meetLabel } from '@/lib/classView'
import { dayLong, studentLabels, weekDays, weekStartOf } from '@/lib/agendaView'
import { durationLabel } from '@/lib/classDraft'
import { nextIndex, nowLineIndex, todaySummary, untilLabel } from '@/lib/todayView'

export const TODAY_TEXTS = {
  title: (day: string) => `Hoy, ${day}`,
  classes: 'Tus clases de hoy',
  week: 'Esta semana',
  openAgenda: 'Abrir la agenda',
  newClass: '+ Nueva clase',
  schedule: 'Agendar una clase',
  noneWeek: 'Sin clases',
  loading: 'Cargando tus clases…',
  loadError: 'No se pudieron cargar tus clases.',
  retry: 'Reintentar',
  now: (t: string) => `Ahora, ${t}`,
  kinds: { fija: 'Se repite todas las semanas', suelta: 'Clase suelta', movida: 'Cambió de día', cancelada: 'Cancelada' },
  enterZoom: 'Entrar a Zoom', enter: 'Entrar a la clase',
  openStudent: 'Ver alumno', edit: 'Editar', restore: 'Restaurar',
  noStudents: 'Todavía no tenés alumnos. Sumalos en "Alumnos" para agendarles clases.',
} as const

const WEEK_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const
const shortDay = (day: string) => `${WEEK_SHORT[new Date(`${day}T12:00:00Z`).getUTCDay()]} ${Number(day.slice(8))}`

export default function TeacherToday({ onOpenStudent, onOpenAgenda }: {
  onOpenStudent: (id: string, email: string) => void
  onOpenAgenda: () => void
}) {
  const T = TODAY_TEXTS
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t) }, [])
  const today = dateInTz(now, CLASS_TZ)
  const week = weekStartOf(today)
  const { data, ready, loadError, reload } = useWeekAgenda(week)

  const labels = useMemo(() => studentLabels(data?.students ?? []), [data?.students])
  const options = useMemo(
    () => [...labels.entries()].map(([id, l]) => ({ id, label: l.full })).sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [labels]
  )
  const editor = useClassEditor({ zoomUrl: data?.zoomUrl ?? null, series: data?.series ?? [], reload, students: options })

  const classes = ready && data ? data.classes : []
  const byDay = (day: string) => classes.filter((c) => dateInTz(new Date(c.startsAt), CLASS_TZ) === day)
  const todays = byDay(today)
  const nameOf = (c: AgendaClass) => labels.get(c.studentId)?.full ?? ''
  const next = nextIndex(todays, now)
  const line = nowLineIndex(todays, now)
  const lead = ready ? todaySummary(todays, now, (i) => labels.get(todays[i].studentId)?.label ?? '') : T.loading
  const noStudents = ready && data?.students.length === 0
  const emailOf = (c: AgendaClass) => data?.students.find((s) => s.id === c.studentId)?.email ?? ''

  const nowLine = (
    <li className={styles.nowline} aria-label={T.now(hhmm(now, CLASS_TZ))} data-testid="now-line">
      <mark className={styles.now}>{hhmm(now, CLASS_TZ)}</mark><i aria-hidden="true" />
    </li>
  )

  function row(c: AgendaClass, i: number) {
    const t = new Date(c.startsAt)
    const kind = classKind(c)
    const ended = t.getTime() + c.durationMin * 60_000 <= now.getTime()
    const isNext = i === next
    const link = c.meetUrl ?? data?.zoomUrl ?? null
    const what = kind === 'cancelada' ? T.kinds.cancelada : isNext || ended ? untilLabel(c, now) : T.kinds[kind]
    return (
      <li key={c.key} data-testid="today-class"
        className={`${styles.cls} ${kind === 'cancelada' ? styles.canc : ''} ${ended && kind !== 'cancelada' ? styles.past : ''}`}>
        <div className={styles.t}>{hhmm(t, CLASS_TZ)}<small>{durationLabel(c.durationMin)}</small></div>
        <div>
          <div className={styles.who}>{nameOf(c)}</div>
          <div className={`${styles.what} ${isNext ? styles.whatNext : ''}`}>{what}</div>
        </div>
        <div className={styles.acts}>
          {kind === 'cancelada' && (
            <button type="button" className={`${styles.btn} ${styles.btnSec}`} disabled={editor.busy} onClick={() => editor.restore(c)}>{T.restore}</button>
          )}
          {isNext && <>
            <button type="button" className={`${styles.btn} ${styles.btnSec}`} onClick={() => onOpenStudent(c.studentId, emailOf(c))}>{T.openStudent}</button>
            {link && (
              <a className={`${styles.btn} ${styles.btnPri}`} href={link} target="_blank" rel="noopener noreferrer">
                {meetLabel(link) === 'Zoom' ? T.enterZoom : T.enter}
              </a>
            )}
          </>}
          {kind !== 'cancelada' && !isNext && !ended && (
            <button type="button" className={`${styles.btn} ${styles.btnSec}`} disabled={editor.busy} onClick={() => editor.edit(c.studentId, c)}>{T.edit}</button>
          )}
        </div>
      </li>
    )
  }

  return (
    <AulaPage title={T.title(dayLong(today))} lead={lead}>
      {loadError && <p className={styles.err}>{T.loadError} <button type="button" className={styles.txtBtn} onClick={reload}>{T.retry}</button></p>}
      {noStudents && <p className={styles.msg}>{T.noStudents}</p>}
      <div className={styles.today}>
        <section aria-label={T.classes}>
          <h2 className={styles.h2}>{T.classes}</h2>
          {ready && todays.length === 0 ? (
            <p className={styles.empty}>
              {!noStudents && <button type="button" className={styles.txtBtn} style={{ fontSize: 16 }} onClick={() => editor.create(null, { date: today })}>{T.schedule}</button>}
            </p>
          ) : (
            <ol className={styles.day}>
              {todays.map((c, i) => <Fragment key={c.key}>{i === line && nowLine}{row(c, i)}</Fragment>)}
              {ready && line === todays.length && nowLine}
            </ol>
          )}
        </section>

        <aside aria-label={T.week}>
          <div className={styles.sideHead}>
            <h2 className={styles.h2}>{T.week}</h2>
            <button type="button" className={styles.txtBtn} style={{ fontSize: 15 }} onClick={onOpenAgenda}>{T.openAgenda}</button>
          </div>
          <ul className={styles.week}>
            {weekDays(week).map((day) => {
              const list = byDay(day)
              return (
                <li key={day} className={styles.wd} data-testid="week-day">
                  <span className={styles.wdName}>{day === today ? <mark className={styles.now}>{shortDay(day)}</mark> : shortDay(day)}</span>
                  <span className={styles.wdItems}>
                    {list.length === 0 && <span className={styles.none}>{T.noneWeek}</span>}
                    {list.map((c) => (
                      <span key={c.key} className={`${styles.wdIt} ${c.status === 'cancelled' ? styles.wdCanc : ''}`}>
                        <span>{hhmm(new Date(c.startsAt), CLASS_TZ)}</span>{labels.get(c.studentId)?.label ?? ''}
                      </span>
                    ))}
                  </span>
                </li>
              )
            })}
          </ul>
          <button type="button" className={`${styles.btn} ${styles.btnSec} ${styles.newBtn}`} disabled={!ready || noStudents}
            onClick={() => editor.create(null, { date: today })}>{T.newClass}</button>
        </aside>
      </div>
      <div className={styles.mobileOnly}><ZoomRoomStatus /></div>
      {editor.error && !editor.isOpen && <p role="alert" className={styles.err}>{editor.error}</p>}
      {editor.dialog}
    </AulaPage>
  )
}
