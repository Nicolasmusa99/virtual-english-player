'use client'
// Calendario (C3) — "Ver el mes" del ALUMNO: grilla de lunes a domingo con sus clases
// (pasadas en gris, hoy resaltado, canceladas en rojo). Tocar un día muestra el detalle
// con el botón para entrar. Pide a /api/student/classes solo el rango de ese mes.
import { useCallback, useEffect, useState } from 'react'
import styles from './student.module.css'
import { EnterButton, CLASSES_TEXTS, toStudentClasses, type StudentClass } from './StudentClasses'
import { dateInTz } from '@/lib/classSchedule'
import {
  byDay, deviceTz, differsFromClassTz, hhmm, longDate, monthGrid, monthRange, monthTitle, shiftMonth, timeRange,
} from '@/lib/classView'

export const MONTH_TEXTS = {
  back: '← Inicio',
  prev: 'Mes anterior',
  next: 'Mes siguiente',
  dows: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
  upcoming: 'Próxima',
  past: 'Ya pasó',
  cancelled: 'Cancelada',
  noClasses: 'No hay clases este día.',
  pickDay: 'Tocá un día para ver el detalle.',
  loading: 'Cargando el mes…',
  error: 'No pudimos cargar el mes.',
} as const

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; classes: StudentClass[] }

export default function StudentMonth({ onBack }: { onBack: () => void }) {
  const tz = deviceTz()
  const today = dateInTz(new Date(), tz)
  const [ym, setYm] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }))
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [selected, setSelected] = useState<string>(today)

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    const { from, to } = monthRange(ym.year, ym.month, tz)
    try {
      const res = await fetch(`/api/student/classes?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      if (!res.ok) throw new Error(String(res.status))
      setState({ kind: 'ok', classes: toStudentClasses(await res.json()) })
    } catch {
      setState({ kind: 'error' })
    }
  }, [ym, tz])
  useEffect(() => { load() }, [load])

  function go(delta: number) {
    const n = shiftMonth(ym.year, ym.month, delta)
    setYm(n)
    const inThis = today.startsWith(`${n.year}-${String(n.month).padStart(2, '0')}`)
    setSelected(inThis ? today : '')
  }

  const now = Date.now()
  const days = state.kind === 'ok' ? byDay(state.classes, tz) : new Map<string, StudentClass[]>()
  const isPast = (c: StudentClass) => new Date(c.startsAt).getTime() + c.durationMin * 60_000 <= now
  const selClasses = selected ? days.get(selected) ?? [] : []
  const anyLocal = state.kind === 'ok' && state.classes.some((c) => differsFromClassTz(new Date(c.startsAt), tz))

  return (
    <section className={styles.moWrap} aria-label={monthTitle(ym.year, ym.month)}>
      <div className={styles.moHead}>
        <button type="button" className={styles.moBack} onClick={onBack}>{MONTH_TEXTS.back}</button>
        <button type="button" className={styles.moArrow} onClick={() => go(-1)} aria-label={MONTH_TEXTS.prev}>‹</button>
        <h2 className={styles.moName}>{monthTitle(ym.year, ym.month)}</h2>
        <button type="button" className={styles.moArrow} onClick={() => go(1)} aria-label={MONTH_TEXTS.next}>›</button>
      </div>

      {state.kind === 'error' && (
        <p className={styles.clMsg}>
          {MONTH_TEXTS.error}{' '}
          <button type="button" className={styles.clLinkBtn} onClick={load}>{CLASSES_TEXTS.retry}</button>
        </p>
      )}

      <div className={styles.moGrid} role="grid" aria-busy={state.kind === 'loading'}>
        {MONTH_TEXTS.dows.map((d) => <div key={d} className={styles.moDow} role="columnheader">{d}</div>)}
        {monthGrid(ym.year, ym.month).map(({ day, inMonth }) => {
          if (!inMonth) return <div key={day} className={`${styles.moDay} ${styles.moOut}`} aria-hidden="true" />
          const list = days.get(day) ?? []
          const cls = [styles.moDay, day < today ? styles.moPast : '', day === today ? styles.moToday : '', day === selected ? styles.moSel : '']
          return (
            <button key={day} type="button" role="gridcell" className={cls.join(' ')} onClick={() => setSelected(day)}
              aria-label={`${longDate(new Date(`${day}T12:00:00Z`), 'UTC')}${list.length ? `, ${list.length} clase${list.length > 1 ? 's' : ''}` : ''}`}
              aria-selected={day === selected}>
              <span className={styles.moNum}>{Number(day.slice(8))}</span>
              {list.map((c) => {
                const kind = c.status === 'cancelled' ? styles.moEvCanc : isPast(c) ? styles.moEvPast : ''
                return (
                  <span key={c.key} className={`${styles.moEv} ${kind}`} data-testid="month-class">
                    <span className={styles.moEvText}>{hhmm(new Date(c.startsAt), tz)}</span>
                  </span>
                )
              })}
            </button>
          )
        })}
      </div>

      <div className={styles.moLegend} aria-hidden="true">
        <span><i className={styles.moSw} />{MONTH_TEXTS.upcoming}</span>
        <span><i className={`${styles.moSw} ${styles.moEvPast}`} />{MONTH_TEXTS.past}</span>
        <span><i className={`${styles.moSw} ${styles.moEvCanc}`} />{MONTH_TEXTS.cancelled}</span>
        {anyLocal && <span className={styles.clTz}>{CLASSES_TEXTS.localTime}</span>}
      </div>

      {!selected ? (
        <p className={styles.clMsg}>{MONTH_TEXTS.pickDay}</p>
      ) : (
        <div className={styles.moDetail} data-testid="day-detail">
          <div className={styles.clLbl}>{longDate(new Date(`${selected}T12:00:00Z`), 'UTC')}</div>
          {selClasses.length === 0 && state.kind === 'ok' && <p className={styles.clMsg}>{MONTH_TEXTS.noClasses}</p>}
          {selClasses.map((c) => {
            const t = new Date(c.startsAt)
            const canc = c.status === 'cancelled'
            const past = isPast(c)
            return (
              <div key={c.key} className={styles.moDetailRow}>
                <div className={styles.moDetailWhen}>
                  <span className={canc ? styles.clStrike : ''}>{timeRange(t, c.durationMin, tz)} · {CLASSES_TEXTS.minutes(c.durationMin)}</span>
                  {canc && <span className={styles.clTagCanc}>{CLASSES_TEXTS.cancelled}</span>}
                  {!canc && c.moved && <span className={styles.clTagMoved}>{CLASSES_TEXTS.moved}</span>}
                </div>
                {!canc && !past && <EnterButton url={c.meetUrl} compact />}
                {!canc && past && <span className={styles.clNoLink}>{MONTH_TEXTS.past}</span>}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
