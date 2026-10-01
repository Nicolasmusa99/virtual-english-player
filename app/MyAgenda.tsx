'use client'
// Calendario (G2) — "Mi agenda" del PROFE: todas sus clases de la semana en una grilla,
// como Google Calendar. Cada alumno con su color; clic en un hueco = crear ahí (con el
// alumno a elegir); clic en una clase = ver el detalle y Editar / Cancelar / Restaurar
// (mismas ventanas y mismo "Solo esta / Esta y las siguientes / Todas" que en la
// pantalla del alumno: useClassEditor). En el celular, un día por vez con la semana
// arriba. Todo en hora de Argentina. Solo habla con /api/classes/**.
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import styles from './classes.module.css'
import { CLASS_TZ, addDays, dateInTz, minuteInTz } from '@/lib/classSchedule'
import { classKind, hhmm, meetLabel, shortDate, timeRange, type TeacherClass } from '@/lib/classView'
import {
  dayHead, dayLong, dayTitle, hourBounds, placeClasses, slotTime, studentLabels, weekDays, weekRange, weekStartOf, weekTitle,
  type AgendaStudent,
} from '@/lib/agendaView'
import { addMinutes } from '@/lib/classDraft'
import { Modal } from './ClassDialog'
import { useClassEditor, type Series } from './useClassEditor'

export const AGENDA_TEXTS = {
  title: 'Mi agenda',
  create: 'Crear',
  today: 'Hoy',
  prevWeek: 'Semana anterior', nextWeek: 'Semana siguiente',
  prevDay: 'Día anterior', nextDay: 'Día siguiente',
  back: '← Inicio', backAria: 'Volver al inicio',
  tz: 'Hora de Argentina',
  loading: 'Cargando tu agenda…',
  loadError: 'No se pudo cargar tu agenda.',
  retry: 'Reintentar',
  empty: 'No tenés clases esta semana.',
  noStudents: 'Todavía no tenés alumnos: agregalos en "Mis alumnos" para agendarles clases.',
  hint: 'Tachada = cancelada · clic en un hueco = crear',
  kinds: { fija: 'Se repite', suelta: 'Una vez', movida: 'Cambió de día', cancelada: 'Cancelada' },
  was: (d: string) => `era el ${d}`,
  enterZoom: 'Entrar a Zoom', enter: 'Entrar a la clase', room: 'Mi sala de Zoom', noLink: 'Sin link de Zoom',
  edit: 'Editar', cancel: 'Cancelar clase', restore: 'Restaurar', openStudent: 'Ver alumno', close: 'Cerrar',
  classWith: (name: string) => `Clase con ${name}`,
  cancelledAria: ' (cancelada)',
} as const

type AgendaClass = TeacherClass & { studentId: string }
type AgendaSeries = Series & { studentId: string }
type Data = { week: string; students: AgendaStudent[]; series: AgendaSeries[]; classes: AgendaClass[]; zoomUrl: string | null }

const HOUR_PX = 48
const NARROW = '(max-width: 700px)'
const pad = (n: number) => String(n).padStart(2, '0')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Celular: un día por vez. (Sin matchMedia —tests— se ve la semana.)
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(NARROW)
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return narrow
}

export default function MyAgenda({ onBack, onOpenStudent }: {
  onBack: () => void
  onOpenStudent?: (id: string, email: string) => void
}) {
  const T = AGENDA_TEXTS
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t) }, [])
  const today = dateInTz(now, CLASS_TZ)
  const [day, setDay] = useState(today) // el día elegido (celular); su semana es la que se ve
  const week = weekStartOf(day)
  const narrow = useNarrow()
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [peek, setPeek] = useState<AgendaClass | null>(null)
  const asked = useRef('')

  const load = useCallback(async () => {
    asked.current = week
    setLoadError(false)
    const { from, to } = weekRange(week)
    try {
      const res = await fetch(`/api/classes/agenda?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      if (!res.ok) throw new Error(String(res.status))
      const body = await res.json()
      if (asked.current !== week) return // ya se pidió otra semana
      setData({
        week,
        students: Array.isArray(body?.students) ? body.students : [],
        series: Array.isArray(body?.series) ? body.series : [],
        classes: Array.isArray(body?.classes) ? body.classes : [],
        zoomUrl: typeof body?.zoomUrl === 'string' ? body.zoomUrl : null,
      })
    } catch {
      if (asked.current === week) setLoadError(true)
    }
  }, [week])
  useEffect(() => { load() }, [load])

  const labels = useMemo(() => studentLabels(data?.students ?? []), [data?.students])
  const options = useMemo(
    () => [...labels.entries()].map(([id, l]) => ({ id, label: l.full })).sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [labels]
  )
  const editor = useClassEditor({ zoomUrl: data?.zoomUrl ?? null, series: data?.series ?? [], reload: load, students: options })

  const ready = data !== null && data.week === week
  const classes = ready ? data.classes : []
  const days = narrow ? [day] : weekDays(week)
  const bounds = hourBounds(classes)
  const hours = Array.from({ length: bounds.to - bounds.from }, (_, i) => bounds.from + i)
  const placed = placeClasses(classes, days)
  const inWeek = new Set(classes.map((c) => c.studentId))
  const legend = [...labels.entries()].filter(([id]) => inWeek.has(id)).sort((a, b) => a[1].label.localeCompare(b[1].label, 'es'))
  const noStudents = ready && data.students.length === 0
  const px = (min: number) => (min * HOUR_PX) / 60

  const move = (dir: -1 | 1) => setDay(addDays(day, dir * (narrow ? 1 : 7)))
  const createAt = (date: string, start = '18:00') => editor.create(null, { date, start, end: addMinutes(start, 60) })
  // "Crear" sin hueco: el día que se ve (celular), hoy si está en la semana, o su lunes.
  const createDefault = () => createAt(narrow ? day : weekDays(week).includes(today) ? today : week)

  function onSlot(date: string, e: MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || !ready || noStudents) return // un clic en una clase no crea
    const offset = ((e.clientY - e.currentTarget.getBoundingClientRect().top) / HOUR_PX) * 60
    createAt(date, slotTime(offset, bounds.from))
  }

  const nowMin = minuteInTz(now, CLASS_TZ)
  const showNow = days.includes(today) && nowMin >= bounds.from * 60 && nowMin < bounds.to * 60
  const studentOf = (c: AgendaClass) => labels.get(c.studentId)
  const emailOf = (c: AgendaClass) => data?.students.find((s) => s.id === c.studentId)?.email ?? ''

  // ── Detalle de una clase (clic en la grilla) ──
  const peekBox = (() => {
    if (!peek || !data) return null
    const who = studentOf(peek)
    const t = new Date(peek.startsAt)
    const kind = classKind(peek)
    const url = peek.meetUrl ?? data.zoomUrl
    const linkLabel = url ? (meetLabel(url) === 'Zoom' ? T.enterZoom : T.enter) : null
    const name = who?.full ?? ''
    const act = (fn: () => void) => () => { setPeek(null); fn() }
    return (
      <Modal label={T.classWith(name)} onClose={() => setPeek(null)}>
        <div className={styles.cdHead}>
          <h3 className={styles.cdTitle}>
            <span className={`${styles.agSw} ${styles['agC' + (who?.color ?? 0)]}`} aria-hidden="true" />{T.classWith(name)}
          </h3>
          <button type="button" className={styles.cdX} onClick={() => setPeek(null)} aria-label={T.close}>×</button>
        </div>
        <div className={styles.cdLine}>
          <span className={styles.cdIco} aria-hidden="true">🕒</span>
          <span className={`${styles.pkWhen} ${kind === 'cancelada' ? styles.pkCanc : ''}`}>
            {cap(dayLong(dateInTz(t, CLASS_TZ)))} · {timeRange(t, peek.durationMin, CLASS_TZ)}
          </span>
          <span className={`${styles.tcKind} ${styles['k_' + kind]}`}>{T.kinds[kind]}</span>
          {kind === 'movida' && peek.originalStartsAt && <span className={styles.tcWas}>{T.was(shortDate(new Date(peek.originalStartsAt), CLASS_TZ).toLowerCase())}</span>}
        </div>
        <div className={styles.cdLine}>
          <span className={styles.cdZ} aria-hidden="true">Z</span>
          {url && linkLabel
            ? <><a className={styles.pkLink} href={url} target="_blank" rel="noopener noreferrer">{linkLabel}</a>
                {!peek.meetUrl && <span className={styles.tcHint}>{T.room}</span>}</>
            : <span className={styles.tcHint}>{T.noLink}</span>}
        </div>
        <div className={styles.cdBtns}>
          {onOpenStudent && <button type="button" className={styles.tcBtn} onClick={act(() => onOpenStudent(peek.studentId, emailOf(peek)))}>{T.openStudent}</button>}
          <span className={styles.cdSp} />
          {kind === 'cancelada'
            ? <button type="button" className={styles.tcPrimary} onClick={act(() => editor.restore(peek))}>{T.restore}</button>
            : <>
                <button type="button" className={styles.tcDanger} onClick={act(() => editor.cancel(peek.studentId, peek))}>{T.cancel}</button>
                <button type="button" className={styles.tcPrimary} onClick={act(() => editor.edit(peek.studentId, peek))}>{T.edit}</button>
              </>}
        </div>
      </Modal>
    )
  })()

  return (
    <section className={`${styles.ag} ${narrow ? styles.agNarrow : ''}`} aria-label={T.title} style={{ ['--agCols' as string]: days.length }}>
      <div className={styles.agSticky}>
        <div className={styles.agTop}>
          {narrow && <button type="button" className={styles.agRound} onClick={onBack} aria-label={T.backAria}>←</button>}
          {!narrow && (
            <button type="button" className={styles.agCreate} onClick={createDefault} disabled={!ready || noStudents}>
              <span className={styles.agPlus} aria-hidden="true">+</span>{T.create}
            </button>
          )}
          {!narrow && <button type="button" className={styles.agToday} onClick={() => setDay(today)}>{T.today}</button>}
          {!narrow && <>
            <button type="button" className={styles.agRound} onClick={() => move(-1)} aria-label={T.prevWeek}>‹</button>
            <button type="button" className={styles.agRound} onClick={() => move(1)} aria-label={T.nextWeek}>›</button>
          </>}
          <h2 className={styles.agTitle} data-testid="agenda-title">{narrow ? dayTitle(day) : weekTitle(week)}</h2>
          {!narrow && <span className={styles.agTz}>{T.tz}</span>}
          <span className={styles.tcSp} />
          {narrow && <>
            <button type="button" className={styles.agToday} onClick={() => setDay(today)}>{T.today}</button>
            <button type="button" className={styles.agRound} onClick={() => move(-1)} aria-label={T.prevDay}>‹</button>
            <button type="button" className={styles.agRound} onClick={() => move(1)} aria-label={T.nextDay}>›</button>
          </>}
          {!narrow && <button type="button" className={styles.tcBtn} onClick={onBack}>{T.back}</button>}
        </div>

        {narrow ? (
          <div className={styles.agStrip} role="group" aria-label={weekTitle(week)}>
            {weekDays(week).map((d) => {
              const h = dayHead(d)
              return (
                <button key={d} type="button" aria-pressed={d === day} aria-label={dayLong(d)} onClick={() => setDay(d)}
                  className={`${styles.agStripDay} ${d === today ? styles.agIsToday : ''} ${d === day ? styles.agPicked : ''}`}>
                  {h.letter}<b className={styles.agNum}>{h.num}</b>
                </button>
              )
            })}
          </div>
        ) : (
          <div className={styles.agHead}>
            <span />
            {days.map((d) => {
              const h = dayHead(d)
              return (
                <div key={d} className={`${styles.agDay} ${d === today ? styles.agIsToday : ''}`} aria-label={dayLong(d)}>
                  {h.short}<b className={styles.agNum}>{h.num}</b>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {loadError && <div className={styles.tcError}>{T.loadError} <button type="button" className={styles.tcBtn} onClick={load}>{T.retry}</button></div>}
      {!ready && !loadError && <div className={styles.agMsg}>{T.loading}</div>}
      {noStudents && <div className={styles.agMsg}>{T.noStudents}</div>}

      <div className={styles.agBody} style={{ height: px((bounds.to - bounds.from) * 60) }}>
        <div className={styles.agHours} aria-hidden="true">
          {hours.map((h) => <span key={h} className={styles.agHour} style={{ top: px((h - bounds.from) * 60) }}>{pad(h)}:00</span>)}
        </div>
        {days.map((d) => (
          <div key={d} className={styles.agCol} data-day={d} onClick={(e) => onSlot(d, e)}>
            {placed.filter((p) => p.day === d).map((p) => {
              const c = p.item
              const who = studentOf(c)
              const t = new Date(c.startsAt)
              const cancelled = c.status === 'cancelled'
              const height = Math.max(18, px(p.endMin - p.startMin) - 2)
              return (
                <button key={c.key} type="button" data-testid="agenda-class"
                  className={`${styles.agEv} ${styles['agC' + (who?.color ?? 0)]} ${cancelled ? styles.agEvCanc : ''} ${height < 36 ? styles.agEvTight : ''}`}
                  style={{
                    top: px(p.startMin - bounds.from * 60) + 1, height,
                    left: `calc(${(p.col / p.cols) * 100}% + 2px)`, width: `calc(${100 / p.cols}% - 5px)`,
                  }}
                  aria-label={`${who?.full ?? ''}, ${dayLong(d)}, ${timeRange(t, c.durationMin, CLASS_TZ)}${cancelled ? T.cancelledAria : ''}`}
                  onClick={() => setPeek(c)}>
                  <b>{who?.label ?? ''}</b><span>{hhmm(t, CLASS_TZ)}</span>
                </button>
              )
            })}
            {d === today && showNow && <div className={styles.agNow} style={{ top: px(nowMin - bounds.from * 60) }} data-testid="agenda-now" />}
          </div>
        ))}
      </div>

      <div className={styles.agLegend}>
        {legend.map(([id, l]) => (
          <span key={id} className={styles.agLegendItem}><i className={`${styles.agSw} ${styles['agC' + l.color]}`} aria-hidden="true" />{l.label}</span>
        ))}
        {ready && classes.length === 0 && !noStudents && <span>{T.empty}</span>}
        <span className={styles.agHint}>{T.hint}</span>
      </div>

      {narrow && (
        <button type="button" className={styles.agFab} onClick={createDefault} disabled={!ready || noStudents} aria-label={T.create}>+</button>
      )}
      {editor.error && !editor.isOpen && <div role="alert" className={styles.tcError}>{editor.error}</div>}
      {peekBox}
      {editor.dialog}
    </section>
  )
}
