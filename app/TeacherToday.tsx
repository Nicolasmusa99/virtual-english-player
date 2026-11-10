'use client'
// Rediseño (fase 2) — "Hoy": el inicio del PROFE. Sus clases del día en orden, con la
// raya amarilla de "ahora" entre las que pasaron y las que vienen; la próxima con
// "Entrar a Zoom". Al costado, la semana en corto. Crear / editar / restaurar usan las
// mismas ventanas que la agenda (useClassEditor). Todo en hora de Argentina.
// G3 liviano: "Copiar invitación" en cada clase que viene (para mandarla por WhatsApp).
import { Fragment, useEffect, useMemo, useState } from 'react'
import styles from './aula.module.css'
import { AulaPage } from './AulaShell'
import ZoomRoomStatus from './ZoomRoomStatus'
import CopyInvite from './CopyInvite'
import { useClassEditor } from './useClassEditor'
import { useWeekAgenda, type AgendaClass } from './useWeekAgenda'
import { CLASS_TZ, dateInTz } from '@/lib/classSchedule'
import { classKind, hhmm, meetLabel } from '@/lib/classView'
import { dayLong, studentLabels, weekDays, weekStartOf } from '@/lib/agendaView'
import { durationLabel } from '@/lib/classDraft'
import { dayTimeline, firstSteps, minutesOf, nextIndex, nowLineIndex, STEPS_DONE_KEY, todaySummary, untilLabel } from '@/lib/todayView'
import { Modal } from './ClassDialog'
import ZoomRoomCard from './ZoomRoomCard'
import { classInvite } from '@/lib/invite'

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
  // Rediseño 2026-11
  nextClass: 'Tu próxima clase',
  emptyDay: 'Cuando agendes una clase para hoy, la vas a ver acá.',
  noZoom: 'Esta clase no tiene link de Zoom. Cargá tu sala y lo usan todas.',
  quick: 'Accesos rápidos',
  students: 'Ver alumnos',
  day: (n: number) => (n === 1 ? '1 clase' : `${n} clases`),
  steps: 'Primeros pasos',
  stepsLeft: (n: number) => (n === 1 ? 'Te falta 1 paso para dar tu primera clase' : `Te faltan ${n} pasos para dar tu primera clase`),
  stepsOf: (n: number) => `${n} de 3`,
  stepsHide: 'Ocultar',
  stepDone: 'Listo',
  stepList: [
    { title: 'Cargá tu sala de Zoom', sub: 'Tus alumnos entran a clase con un solo botón.', action: 'Cargar el link' },
    { title: 'Sumá a tu primer alumno', sub: 'Con su nombre y su mail. Después le copiás la invitación.', action: 'Sumar alumno' },
    { title: 'Agendá la primera clase', sub: 'Suelta o con horario fijo todas las semanas.', action: 'Agendar' },
  ],
  zoomTitle: 'Mi sala de Zoom',
  zoomClose: 'Listo',
} as const

const WEEK_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const
const shortDay = (day: string) => `${WEEK_SHORT[new Date(`${day}T12:00:00Z`).getUTCDay()]} ${Number(day.slice(8))}`

const Rings = () => (
  <svg className={styles.heroRings} viewBox="0 0 420 420" fill="none" aria-hidden="true">
    <circle cx="210" cy="210" r="209" stroke="rgba(143,180,236,0.14)" /><circle cx="210" cy="210" r="150" stroke="rgba(143,180,236,0.18)" /><circle cx="210" cy="210" r="92" stroke="rgba(143,180,236,0.24)" />
  </svg>
)
const Check = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>

export default function TeacherToday({ onOpenStudent, onOpenAgenda, onOpenStudents }: {
  onOpenStudent: (id: string, email: string, name: string | null) => void
  onOpenAgenda: () => void
  /** Ir a "Alumnos" (accesos rápidos y primeros pasos). */
  onOpenStudents?: () => void
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
  const realName = (c: AgendaClass) => data?.students.find((s) => s.id === c.studentId)?.name ?? null

  // La próxima clase de hoy va arriba, en el panel de tinta.
  const nextClass = next >= 0 ? todays[next] : null
  const nextLink = nextClass ? nextClass.meetUrl ?? data?.zoomUrl ?? null : null
  const tl = ready
    ? dayTimeline(todays.map((c) => ({ startMin: minutesOf(hhmm(new Date(c.startsAt), CLASS_TZ)), durationMin: c.durationMin })), minutesOf(hhmm(now, CLASS_TZ)))
    : null

  // Primeros pasos: hasta que cargó su sala, sumó un alumno y agendó una clase (o los oculta).
  const [stepsHidden, setStepsHidden] = useState(true)
  const [zoomOpen, setZoomOpen] = useState(false)
  useEffect(() => { try { setStepsHidden(window.localStorage.getItem(STEPS_DONE_KEY) === '1') } catch { setStepsHidden(false) } }, [])
  const steps = firstSteps({ hasZoom: !!data?.zoomUrl, students: data?.students.length ?? 0, classes: (data?.classes.length ?? 0) + (data?.series.length ?? 0) })
  const hideSteps = () => { setStepsHidden(true); try { window.localStorage.setItem(STEPS_DONE_KEY, '1') } catch { /* sin almacenamiento: se ocultan por esta vez */ } }
  const stepsComplete = ready && !!data && steps.current === -1
  useEffect(() => { if (stepsComplete) { try { window.localStorage.setItem(STEPS_DONE_KEY, '1') } catch { /* nada */ } } }, [stepsComplete])
  const showSteps = ready && !!data && !stepsHidden && steps.current !== -1
  const stepActions = [() => setZoomOpen(true), () => onOpenStudents?.(), () => editor.create(null, { date: today })]

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
          {kind !== 'cancelada' && !ended && link && (
            <div className={styles.invite}>
              <CopyInvite text={classInvite({ name: realName(c), startsAt: c.startsAt, durationMin: c.durationMin, url: link })}
                className={styles.txtBtn} okClassName={styles.zsOk} />
            </div>
          )}
        </div>
        <div className={styles.acts}>
          {kind === 'cancelada' && (
            <button type="button" className={`${styles.btn} ${styles.btnSec}`} disabled={editor.busy} onClick={() => editor.restore(c)}>{T.restore}</button>
          )}
          {kind !== 'cancelada' && !isNext && !ended && (
            <button type="button" className={`${styles.btn} ${styles.btnSec}`} disabled={editor.busy} onClick={() => editor.edit(c.studentId, c)}>{T.edit}</button>
          )}
        </div>
      </li>
    )
  }

  return (
    <AulaPage bare title={T.title(dayLong(today))} lead={lead}>
      {loadError && <p className={styles.err}>{T.loadError} <button type="button" className={styles.txtBtn} onClick={reload}>{T.retry}</button></p>}
      {noStudents && !showSteps && <p className={styles.msg}>{T.noStudents}</p>}
      <div className={styles.today}>
        {showSteps && <>
          <section className={styles.hero} aria-label={T.steps} data-testid="first-steps">
            <Rings />
            <div className={styles.heroIn}>
              <div className={styles.heroMain}>
                <div className={styles.heroKicker}>{T.steps}</div>
                <div className={styles.heroTitle}>{T.stepsLeft(3 - steps.count)}</div>
                <div className={styles.heroBar}>
                  <span className={styles.heroSegs} aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} data-on={i < steps.count} />)}</span>
                  {T.stepsOf(steps.count)}
                </div>
              </div>
              <div className={styles.heroActs}>
                <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={hideSteps}>{T.stepsHide}</button>
              </div>
            </div>
          </section>
          <ol className={styles.steps} aria-label={T.steps}>
            {T.stepList.map((st, i) => {
              const done = steps.done[i]
              const isNow = i === steps.current
              return (
                <li key={st.title} className={`${styles.step} ${done ? styles.stepDone : ''} ${isNow ? styles.stepNow : ''}`}>
                  <span className={styles.stepMark} aria-hidden="true">{done ? <Check /> : i + 1}</span>
                  <div className={styles.stepTitle}>{st.title}</div>
                  <div className={styles.stepSub}>{st.sub}</div>
                  {done
                    ? <span className={styles.stepOk}>{T.stepDone}</span>
                    : <div><button type="button" className={`${styles.btn} ${isNow ? styles.btnPri : styles.btnSec}`}
                        disabled={(i === 1 && !onOpenStudents) || (i === 2 && (noStudents || editor.busy))} onClick={stepActions[i]}>{st.action}</button></div>}
                </li>
              )
            })}
          </ol>
        </>}

        {nextClass && (
          <section className={styles.hero} aria-label={T.nextClass} data-testid="next-hero">
            <Rings />
            <div className={styles.heroIn}>
              <div className={styles.heroMain}>
                <div className={styles.heroKicker}>{T.nextClass} <mark className={styles.now}>{untilLabel(nextClass, now)}</mark></div>
                <div className={styles.heroTime}>{hhmm(new Date(nextClass.startsAt), CLASS_TZ)}<small>{durationLabel(nextClass.durationMin)}</small></div>
                <div className={styles.heroWho}>{nameOf(nextClass)}</div>
                {!nextLink && <div className={styles.heroSub}>{T.noZoom}</div>}
              </div>
              <div className={styles.heroActs}>
                {nextLink && (
                  <a className={`${styles.btn} ${styles.btnPri}`} href={nextLink} target="_blank" rel="noopener noreferrer">
                    {meetLabel(nextLink) === 'Zoom' ? T.enterZoom : T.enter}
                  </a>
                )}
                <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => onOpenStudent(nextClass.studentId, emailOf(nextClass), realName(nextClass))}>{T.openStudent}</button>
              </div>
            </div>
          </section>
        )}

        <div className={styles.row2}>
          <section className={styles.card} aria-label={T.classes}>
            <div className={styles.cardHead}>
              <h2 className={styles.h2}>{T.classes}</h2>
              {ready && todays.length > 0 && <span className={styles.cardNote}>{T.day(todays.length)}</span>}
            </div>
            {tl && (
              <div className={styles.tl} aria-hidden="true" data-testid="day-timeline">
                <div className={styles.tlTrack}>
                  {todays.map((c, i) => {
                    const t = new Date(c.startsAt)
                    const canc = c.status === 'cancelled'
                    const ended = t.getTime() + c.durationMin * 60_000 <= now.getTime()
                    return (
                      <div key={c.key} className={`${styles.tlBlock} ${canc ? styles.tlCanc : i === next ? styles.tlNext : ended ? styles.tlPast : ''}`}
                        style={{ left: `${tl.items[i].left}%`, width: `${tl.items[i].width}%` }}>
                        <small>{hhmm(t, CLASS_TZ)}</small>{labels.get(c.studentId)?.label ?? ''}
                      </div>
                    )
                  })}
                  {tl.nowLeft !== null && <div className={styles.tlNow} style={{ left: `${tl.nowLeft}%` }} />}
                </div>
                <div className={styles.tlHours}>{tl.hours.map((h) => <span key={h}>{h}:00</span>)}</div>
              </div>
            )}
            {ready && todays.length === 0 ? (
              <p className={styles.empty}>
                {T.emptyDay}{' '}
                {!noStudents && <button type="button" className={styles.txtBtn} style={{ fontSize: 16 }} onClick={() => editor.create(null, { date: today })}>{T.schedule}</button>}
              </p>
            ) : (
              <ol className={styles.day}>
                {todays.map((c, i) => <Fragment key={c.key}>{i === line && nowLine}{row(c, i)}</Fragment>)}
                {ready && line === todays.length && nowLine}
              </ol>
            )}
          </section>

          <aside className={`${styles.card} ${styles.quick}`} aria-label={T.quick}>
            <h2 className={styles.h2}>{T.quick}</h2>
            <button type="button" className={`${styles.btn} ${styles.btnInk} ${styles.newBtn}`} disabled={!ready || noStudents}
              onClick={() => editor.create(null, { date: today })}>{T.newClass}</button>
            {onOpenStudents && <button type="button" className={`${styles.btn} ${styles.btnSec}`} onClick={onOpenStudents}>{T.students}</button>}
          </aside>
        </div>

        <aside className={styles.card} aria-label={T.week}>
          <div className={styles.cardHead}>
            <h2 className={styles.h2}>{T.week}</h2>
            <button type="button" className={styles.txtBtn} style={{ fontSize: 15 }} onClick={onOpenAgenda}>{T.openAgenda}</button>
          </div>
          <ul className={styles.week}>
            {weekDays(week).map((day) => {
              const list = byDay(day)
              return (
                <li key={day} className={`${styles.wd} ${day === today ? styles.wdToday : ''}`} data-testid="week-day">
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
        </aside>
        <div className={styles.mobileOnly}><ZoomRoomStatus /></div>
      </div>
      {zoomOpen && (
        <Modal label={T.zoomTitle} onClose={() => setZoomOpen(false)}>
          <div className={styles.zsBox}>
            <ZoomRoomCard onSaved={() => reload()} />
            <button type="button" className={`${styles.btn} ${styles.btnSec} ${styles.zsClose}`} onClick={() => setZoomOpen(false)}>{T.zoomClose}</button>
          </div>
        </Modal>
      )}
      {editor.error && !editor.isOpen && <p role="alert" className={styles.err}>{editor.error}</p>}
      {editor.dialog}
    </AulaPage>
  )
}
