'use client'
// Vista del alumno v2 — "Calendario" del ALUMNO: la misma grilla semanal que "Mi agenda" del
// profe (estilos de classes.module.css), en la hora del DISPOSITIVO del alumno. Hoy y la raya
// de "ahora" en amarillo; las que ya pasaron, más claras; las canceladas, tachadas en rojo.
// Tocar una clase abre el detalle con "Entrar a Zoom". En el celular, un día por vez con la
// semana arriba. Una semana sin clases lo dice y ofrece ir a la próxima (`upcoming`: las que
// ya cargó el inicio). Reemplaza a "Ver el mes". Solo habla con /api/student/classes.
import { useCallback, useEffect, useRef, useState } from 'react'
import ag from './classes.module.css'
import styles from './student.module.css'
import { Modal } from './ClassDialog'
import { useNarrow } from './MyAgenda'
import { CLASSES_TEXTS, EnterButton, toStudentClasses, toTeacherName, type StudentClass } from './StudentClasses'
import { addDays, dateInTz, minuteInTz } from '@/lib/classSchedule'
import { deviceTz, differsFromClassTz, hhmm, longDate, splitUpcoming, timeRange } from '@/lib/classView'
import {
  dayHead, dayLong, dayTitle, hourBounds, placeClasses, weekDays, weekRange, weekStartOf, weekTitle,
} from '@/lib/agendaView'

export const WEEK_TEXTS = {
  title: 'Calendario',
  today: 'Hoy',
  prevWeek: 'Semana anterior', nextWeek: 'Semana siguiente',
  prevDay: 'Día anterior', nextDay: 'Día siguiente',
  tz: 'Hora de Argentina',
  loading: 'Cargando tus clases…',
  error: 'No pudimos cargar tus clases.',
  upcoming: 'Próxima', past: 'Ya pasó', cancelled: 'Cancelada', moved: 'Cambió de día',
  emptyWeek: 'No tenés clases esta semana',
  emptyDay: 'No tenés clases este día',
  nextIs: (day: string, time: string) => `La próxima es el ${day} a las ${time}.`,
  goWeek: 'Ir a esa semana', goDay: 'Ir a ese día',
  none: 'Todavía no tenés clases agendadas.',
  classWith: (name: string | null) => (name ? `Clase con ${name}` : 'Tu clase'),
  when: 'Cuándo',
  pastNote: 'Esta clase ya pasó.',
  close: 'Cerrar',
  cancelledAria: ' (cancelada)',
  withClass: ', con clase',
} as const

const HOUR_PX = 48
const pad = (n: number) => String(n).padStart(2, '0')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const firstWord = (s: string | null) => (s ? s.split(/\s+/)[0] : null)

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ok'; week: string; classes: StudentClass[]; teacherName: string | null }

export default function StudentWeek({ upcoming }: { upcoming: StudentClass[] }) {
  const T = WEEK_TEXTS
  const tz = deviceTz()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t) }, [])
  const today = dateInTz(now, tz)
  const [day, setDay] = useState(today) // el día elegido (celular); su semana es la que se ve
  const week = weekStartOf(day)
  const narrow = useNarrow()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [peek, setPeek] = useState<StudentClass | null>(null)
  const asked = useRef('')

  // Si se pide otra semana antes de que llegue la anterior, la respuesta vieja se descarta.
  const load = useCallback(async () => {
    asked.current = week
    setState({ kind: 'loading' })
    const { from, to } = weekRange(week, tz)
    try {
      const res = await fetch(`/api/student/classes?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      if (!res.ok) throw new Error(String(res.status))
      const body = await res.json()
      if (asked.current !== week) return
      setState({ kind: 'ok', week, classes: toStudentClasses(body), teacherName: toTeacherName(body) })
    } catch {
      if (asked.current === week) setState({ kind: 'error' })
    }
  }, [week, tz])
  useEffect(() => { load() }, [load])

  const ready = state.kind === 'ok' && state.week === week
  const classes = ready ? state.classes : []
  const teacherName = ready ? state.teacherName : null
  const days = narrow ? [day] : weekDays(week)
  const bounds = hourBounds(classes, tz)
  const hours = Array.from({ length: bounds.to - bounds.from }, (_, i) => bounds.from + i)
  const placed = placeClasses(classes, days, tz)
  const px = (min: number) => (min * HOUR_PX) / 60
  const isPast = (c: StudentClass) => new Date(c.startsAt).getTime() + c.durationMin * 60_000 <= now.getTime()
  const move = (dir: -1 | 1) => setDay(addDays(day, dir * (narrow ? 1 : 7)))
  const local = differsFromClassTz(now, tz)
  const withClass = new Set(classes.map((c) => dateInTz(new Date(c.startsAt), tz)))
  const label = teacherName ? T.classWith(firstWord(teacherName)) : T.classWith(null)

  const nowMin = minuteInTz(now, tz)
  const showNow = days.includes(today) && nowMin >= bounds.from * 60 && nowMin < bounds.to * 60

  // Nada que mostrar en lo que se ve: lo dice y, si hay una próxima en otra semana, ofrece ir.
  const note = (() => {
    if (!ready || placed.length > 0) return null
    if (narrow && classes.length > 0) return <div className={styles.emTitle}>{T.emptyDay}</div>
    const nextUp = splitUpcoming(upcoming, now).next
    const nextDay = nextUp ? dateInTz(new Date(nextUp.startsAt), tz) : null
    if (!nextUp || !nextDay) return <><div className={styles.emTitle}>{T.emptyWeek}</div><div className={styles.emSub}>{T.none}</div></>
    if (weekDays(week).includes(nextDay)) return <div className={styles.emTitle}>{T.emptyDay}</div>
    const t = new Date(nextUp.startsAt)
    return (
      <>
        <div className={styles.emTitle}>{T.emptyWeek}</div>
        <div className={styles.emSub}>{T.nextIs(longDate(t, tz), hhmm(t, tz))}</div>
        <button type="button" className={styles.clCalBtn} onClick={() => setDay(nextDay)}>{narrow ? T.goDay : T.goWeek}</button>
      </>
    )
  })()

  // ── Detalle de una clase ──
  const peekBox = (() => {
    if (!peek) return null
    const t = new Date(peek.startsAt)
    const canc = peek.status === 'cancelled'
    const past = isPast(peek)
    const title = T.classWith(teacherName)
    return (
      <Modal label={title} onClose={() => setPeek(null)}>
        <div className={ag.cdHead}>
          <h3 className={ag.cdTitle}>{title}</h3>
          <button type="button" className={ag.cdX} onClick={() => setPeek(null)} aria-label={T.close}>×</button>
        </div>
        <div className={ag.cdLine}>
          <span className={ag.cdKey}>{T.when}</span>
          <div className={ag.pkVals}>
            <span className={`${ag.pkWhen} ${canc ? ag.pkCanc : ''}`}>{cap(longDate(t, tz))}, {timeRange(t, peek.durationMin, tz)}</span>
            {canc && <span className={`${ag.tcKind} ${ag.k_cancelada}`}>{T.cancelled}</span>}
            {!canc && peek.moved && <span className={`${ag.tcKind} ${ag.k_movida}`}>{T.moved}</span>}
            {!canc && past && <span className={ag.tcKind}>{T.pastNote}</span>}
            {local && <span className={ag.tcKind}>{CLASSES_TEXTS.localTime}</span>}
          </div>
        </div>
        <div className={ag.cdBtns}>
          <button type="button" className={ag.tcBtn} onClick={() => setPeek(null)}>{T.close}</button>
          {!canc && !past && <EnterButton url={peek.meetUrl} compact />}
        </div>
      </Modal>
    )
  })()

  return (
    <section className={`${ag.ag} ${narrow ? ag.agNarrow : ''} ${styles.wk}`} aria-label={T.title} style={{ ['--agCols' as string]: days.length }}>
      <div className={ag.agSticky}>
        <div className={ag.agTop}>
          <h1 className={ag.agTitle} data-testid="week-title">{narrow ? dayTitle(day) : weekTitle(week)}</h1>
          {!narrow && <>
            <button type="button" className={ag.agRound} onClick={() => move(-1)} aria-label={T.prevWeek}>‹</button>
            <button type="button" className={ag.agRound} onClick={() => move(1)} aria-label={T.nextWeek}>›</button>
            <button type="button" className={ag.agToday} onClick={() => setDay(today)}>{T.today}</button>
            <span className={ag.agTz}>{local ? CLASSES_TEXTS.localTime : T.tz}</span>
          </>}
          <span className={ag.tcSp} />
          {narrow && <>
            <button type="button" className={ag.agToday} onClick={() => setDay(today)}>{T.today}</button>
            <button type="button" className={ag.agRound} onClick={() => move(-1)} aria-label={T.prevDay}>‹</button>
            <button type="button" className={ag.agRound} onClick={() => move(1)} aria-label={T.nextDay}>›</button>
          </>}
        </div>

        {narrow ? (
          <div className={ag.agStrip} role="group" aria-label={weekTitle(week)}>
            {weekDays(week).map((d) => {
              const h = dayHead(d)
              return (
                <button key={d} type="button" aria-pressed={d === day} aria-label={`${dayLong(d)}${withClass.has(d) ? T.withClass : ''}`} onClick={() => setDay(d)}
                  className={`${ag.agStripDay} ${d === today ? ag.agIsToday : ''} ${d === day ? ag.agPicked : ''}`}>
                  {h.letter}<b className={ag.agNum}>{h.num}</b>
                  <i className={`${styles.wkDot} ${withClass.has(d) ? styles.wkDotOn : ''}`} aria-hidden="true" />
                </button>
              )
            })}
          </div>
        ) : (
          <div className={ag.agHead}>
            <span />
            {days.map((d) => {
              const h = dayHead(d)
              return (
                <div key={d} className={`${ag.agDay} ${d === today ? ag.agIsToday : ''}`} aria-label={dayLong(d)}>
                  {h.short}<b className={ag.agNum}>{h.num}</b>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {state.kind === 'error' && (
        <div className={ag.tcError}>{T.error} <button type="button" className={ag.tcBtn} onClick={load}>{CLASSES_TEXTS.retry}</button></div>
      )}
      {state.kind === 'loading' && <div className={ag.agMsg} role="status">{T.loading}</div>}

      <div className={ag.agBody} style={{ height: px((bounds.to - bounds.from) * 60) }}>
        <div className={ag.agHours} aria-hidden="true">
          {hours.map((h) => <span key={h} className={ag.agHour} style={{ top: px((h - bounds.from) * 60) }}>{pad(h)}:00</span>)}
        </div>
        {days.map((d) => (
          <div key={d} className={`${ag.agCol} ${styles.wkCol}`} data-day={d}>
            {placed.filter((p) => p.day === d).map((p) => {
              const c = p.item
              const t = new Date(c.startsAt)
              const canc = c.status === 'cancelled'
              const kind = canc ? styles.wkCanc : isPast(c) ? styles.wkPast : styles.wkNext
              const height = Math.max(18, px(p.endMin - p.startMin) - 2)
              return (
                <button key={c.key} type="button" data-testid="week-class"
                  className={`${ag.agEv} ${kind} ${height < 36 ? ag.agEvTight : ''}`}
                  style={{
                    top: px(p.startMin - bounds.from * 60) + 1, height,
                    left: `calc(${(p.col / p.cols) * 100}% + 2px)`, width: `calc(${100 / p.cols}% - 5px)`,
                  }}
                  aria-label={`${label}, ${dayLong(d)}, ${timeRange(t, c.durationMin, tz)}${canc ? T.cancelledAria : ''}`}
                  onClick={() => setPeek(c)}>
                  <b>{label}</b><span>{canc ? T.cancelled : timeRange(t, c.durationMin, tz)}</span>
                </button>
              )
            })}
            {d === today && showNow && <div className={ag.agNow} style={{ top: px(nowMin - bounds.from * 60) }} data-testid="week-now" />}
          </div>
        ))}
        {note && <div className={styles.wkNote} role="status" data-testid="week-note">{note}</div>}
      </div>

      <div className={ag.agLegend} aria-hidden="true">
        <span className={ag.agLegendItem}><i className={`${ag.agSw} ${styles.wkNext}`} />{T.upcoming}</span>
        <span className={ag.agLegendItem}><i className={`${ag.agSw} ${styles.wkPast}`} />{T.past}</span>
        <span className={ag.agLegendItem}><i className={`${ag.agSw} ${styles.wkCanc}`} />{T.cancelled}</span>
        {narrow && <span className={ag.agHint}>{local ? CLASSES_TEXTS.localTime : T.tz}</span>}
      </div>

      {peekBox}
    </section>
  )
}
