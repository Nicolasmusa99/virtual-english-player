'use client'
// Calendario (C3) — sección "Clases" en la pantalla de un alumno (lado PROFE / ADMIN).
// Horario fijo (crear, editar, terminar), clase suelta, y por cada próxima clase:
// editar / cancelar / restaurar (G0: todo dice "Editar"). Todo en hora de Argentina
// (en la que carga el profe). Solo habla con /api/classes/** — quién puede tocar qué lo
// decide el servidor (lib/classAccess.ts).
import { useCallback, useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import styles from './classes.module.css'
import { CLASS_TZ, addDays, dateInTz } from '@/lib/classSchedule'
import {
  classKind, dayMonth, formDate, formTime, meetLabel, relativeDay, seriesTitle, shortDate, timeRange, WEEKDAYS,
  type TeacherClass,
} from '@/lib/classView'

type Series = { id: string; weekday: number; time: string; durationMin: number; startsOn: string; endsOn: string | null; meetUrl: string | null }

export const TEACHER_CLASS_TEXTS = {
  title: 'Clases',
  tzNote: 'Horarios en hora de Argentina',
  addSingle: '+ Clase suelta',
  fixed: 'Horario fijo',
  noFixed: 'Todavía no tiene horario fijo.',
  addFixed: '+ Horario fijo',
  addOtherFixed: '+ Otro horario fijo',
  change: 'Editar',
  end: 'Terminar',
  upcoming: 'Próximas clases',
  none: 'No hay clases agendadas.',
  showing: 'Mostrando las próximas 5 semanas.',
  today: 'Hoy',
  kinds: { fija: 'Se repite', suelta: 'Una vez', movida: 'Cambió de día', cancelada: 'Cancelada' },
  was: (d: string) => `era el ${d}`,
  cancel: 'Cancelar', restore: 'Restaurar', edit: 'Editar',
  save: 'Guardar', close: 'Cancelar',
  day: 'Día', hour: 'Hora', duration: 'Duración', from: 'Desde', date: 'Fecha',
  link: 'Link de la clase (Zoom, Meet o Teams)',
  linkPh: 'https://meet.google.com/…',
  linkPhRoom: 'Vacío = Mi sala de Zoom',
  room: 'Mi sala de Zoom',
  newFixed: 'Nuevo horario fijo',
  changeFixed: 'Editar el horario fijo',
  changeHint: 'Las clases de antes de esa fecha quedan como estaban.',
  fixedHint: 'Se repite todas las semanas.',
  newSingle: 'Nueva clase suelta',
  editSingle: 'Editar clase suelta',
  moveTitle: (d: string) => `Editar la clase del ${d}`,
  moveHint: 'El alumno lo ve al instante. Las demás clases no cambian.',
  confirmCancel: (d: string) => `¿Cancelar la clase del ${d}? El alumno la va a ver cancelada.`,
  confirmEnd: (t: string) => `¿Terminar el horario "${t}"? Desde mañana deja de repetirse.`,
  loading: 'Cargando clases…',
  loadError: 'No se pudieron cargar las clases.',
  retry: 'Reintentar',
  saveError: 'No se pudo guardar.',
  minutes: (n: number) => `${n} min`,
  since: (d: string) => `desde el ${d}`,
  until: (d: string) => `hasta el ${d}`,
} as const

const DURATIONS = [30, 45, 60, 75, 90, 120]

// De qué es el link de una clase/horario. Sin link propio → "Mi sala de Zoom" (si hay).
function LinkPill({ url, room }: { url: string | null; room: string | null }) {
  const label = url ? meetLabel(url) : room ? TEACHER_CLASS_TEXTS.room : null
  return label ? <span className={styles.tcPill}>{label}</span> : null
}

type Form =
  | { kind: 'newSeries' }
  | { kind: 'changeSeries'; series: Series }
  | { kind: 'single' }
  | { kind: 'editSingle'; c: TeacherClass }
  | { kind: 'move'; c: TeacherClass }

type Fields = { weekday: string; date: string; time: string; durationMin: string; meetUrl: string }

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (res.ok) return { ok: true }
    const data = await res.json().catch(() => null)
    return { ok: false, error: typeof data?.error === 'string' ? data.error : undefined }
  } catch {
    return { ok: false }
  }
}

export default function TeacherClasses({ studentId }: { studentId: string }) {
  const T = TEACHER_CLASS_TEXTS
  const [data, setData] = useState<{ series: Series[]; classes: TeacherClass[]; zoomUrl: string | null } | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [f, setF] = useState<Fields>({ weekday: '2', date: '', time: '18:00', durationMin: '60', meetUrl: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

  function open(next: Form) {
    setError('')
    setForm(next)
    if (next.kind === 'newSeries') setF({ weekday: '2', date: today, time: '18:00', durationMin: '60', meetUrl: '' })
    if (next.kind === 'changeSeries') {
      const s = next.series
      setF({ weekday: String(s.weekday), date: today > s.startsOn ? today : s.startsOn, time: s.time, durationMin: String(s.durationMin), meetUrl: s.meetUrl ?? '' })
    }
    if (next.kind === 'single') setF({ weekday: '', date: today, time: '18:00', durationMin: '60', meetUrl: data?.zoomUrl ? '' : data?.series[0]?.meetUrl ?? '' })
    if (next.kind === 'editSingle' || next.kind === 'move') {
      const t = new Date(next.c.startsAt)
      setF({ weekday: '', date: formDate(t), time: formTime(t), durationMin: String(next.c.durationMin), meetUrl: next.c.meetUrl ?? '' })
    }
  }

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setError('')
    const r = await action()
    setBusy(false)
    if (!r.ok) { setError(r.error ?? T.saveError); return }
    setForm(null)
    await load()
  }

  function submit() {
    if (!form) return
    const durationMin = Number(f.durationMin)
    const meetUrl = f.meetUrl.trim()
    if (form.kind === 'newSeries') {
      return run(() => send('/api/classes/series', 'POST', { studentId, weekday: Number(f.weekday), time: f.time, durationMin, startsOn: f.date, meetUrl }))
    }
    if (form.kind === 'changeSeries') {
      const old = form.series
      return run(async () => {
        // Cambiar = terminar el viejo el día anterior + crear el nuevo desde esa fecha.
        // Si el nuevo arranca antes o el mismo día que el viejo, el viejo no tuvo clases: se borra.
        const endOld = f.date > old.startsOn
          ? await send(`/api/classes/series/${old.id}`, 'PATCH', { endsOn: addDays(f.date, -1) })
          : await send(`/api/classes/series/${old.id}`, 'DELETE')
        if (!endOld.ok) return endOld
        const created = await send('/api/classes/series', 'POST', { studentId, weekday: Number(f.weekday), time: f.time, durationMin, startsOn: f.date, meetUrl })
        if (!created.ok && f.date > old.startsOn) await send(`/api/classes/series/${old.id}`, 'PATCH', { endsOn: old.endsOn }) // deshacer
        return created
      })
    }
    if (form.kind === 'single') {
      return run(() => send('/api/classes/events', 'POST', { studentId, date: f.date, time: f.time, durationMin, meetUrl }))
    }
    if (form.kind === 'editSingle') {
      return run(() => send(`/api/classes/events/${form.c.eventId}`, 'PATCH', { date: f.date, time: f.time, durationMin, meetUrl }))
    }
    if (form.kind === 'move') {
      const c = form.c
      return run(() => send('/api/classes/events', 'POST', {
        seriesId: c.seriesId, originalStartsAt: c.originalStartsAt ?? c.startsAt, action: 'move', date: f.date, time: f.time, durationMin,
      }))
    }
  }

  const label = (c: TeacherClass) => shortDate(new Date(c.startsAt), CLASS_TZ).toLowerCase()

  function cancelClass(c: TeacherClass) {
    if (!window.confirm(T.confirmCancel(label(c)))) return
    run(() => c.seriesId
      ? send('/api/classes/events', 'POST', { seriesId: c.seriesId, originalStartsAt: c.originalStartsAt ?? c.startsAt, action: 'cancel' })
      : send(`/api/classes/events/${c.eventId}`, 'PATCH', { status: 'cancelled' }))
  }
  function restore(c: TeacherClass) {
    // Una clase fija cancelada/movida vuelve al horario fijo borrando la excepción;
    // una suelta cancelada vuelve a "programada".
    run(() => c.seriesId ? send(`/api/classes/events/${c.eventId}`, 'DELETE') : send(`/api/classes/events/${c.eventId}`, 'PATCH', { status: 'scheduled' }))
  }
  function endSeries(s: Series) {
    if (!window.confirm(T.confirmEnd(seriesTitle(s.weekday, s.time)))) return
    // Termina hoy (la clase de hoy, si hay, queda). Si todavía no empezó, se borra entera.
    run(() => today < s.startsOn
      ? send(`/api/classes/series/${s.id}`, 'DELETE')
      : send(`/api/classes/series/${s.id}`, 'PATCH', { endsOn: today }))
  }

  const field = (lbl: string, input: ReactNode) => <label className={styles.tcField}>{lbl}{input}</label>
  const set = (key: keyof Fields) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [key]: e.target.value }))

  function renderForm(where: 'series' | 'single' | string) {
    if (!form) return null
    const here =
      (where === 'series' && (form.kind === 'newSeries' || form.kind === 'changeSeries')) ||
      (where === 'single' && form.kind === 'single') ||
      ((form.kind === 'move' || form.kind === 'editSingle') && form.c.key === where)
    if (!here) return null
    const isSeries = form.kind === 'newSeries' || form.kind === 'changeSeries'
    const title =
      form.kind === 'newSeries' ? T.newFixed : form.kind === 'changeSeries' ? T.changeFixed : form.kind === 'single' ? T.newSingle
        : form.kind === 'editSingle' ? T.editSingle : T.moveTitle(label(form.c))
    const hint = form.kind === 'newSeries' ? T.fixedHint : form.kind === 'changeSeries' ? T.changeHint : form.kind === 'move' ? T.moveHint : ''
    return (
      <form className={styles.tcForm} onSubmit={(e) => { e.preventDefault(); submit() }} aria-label={title}>
        <div className={styles.tcFormTitle}>{title}</div>
        <div className={styles.tcFields}>
          {isSeries && field(T.day,
            <select className={styles.tcInput} value={f.weekday} onChange={set('weekday')}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{WEEKDAYS[d].charAt(0).toUpperCase() + WEEKDAYS[d].slice(1)}</option>)}
            </select>)}
          {!isSeries && field(T.date, <input className={styles.tcInput} type="date" required value={f.date} onChange={set('date')} />)}
          {field(T.hour, <input className={styles.tcInput} type="time" required value={f.time} onChange={set('time')} />)}
          {field(T.duration,
            <select className={styles.tcInput} value={f.durationMin} onChange={set('durationMin')}>
              {(DURATIONS.includes(Number(f.durationMin)) ? DURATIONS : [...DURATIONS, Number(f.durationMin)].sort((a, b) => a - b))
                .map((d) => <option key={d} value={d}>{T.minutes(d)}</option>)}
            </select>)}
          {isSeries && field(T.from, <input className={styles.tcInput} type="date" required value={f.date} onChange={set('date')} />)}
          {form.kind !== 'move' && (
            <label className={`${styles.tcField} ${styles.tcFieldWide}`}>{T.link}
              <input className={styles.tcInput} type="url" inputMode="url" placeholder={data?.zoomUrl ? T.linkPhRoom : T.linkPh} value={f.meetUrl} onChange={set('meetUrl')} />
            </label>
          )}
        </div>
        {error && <div role="alert" className={styles.tcError}>{error}</div>}
        <div className={styles.tcBtns}>
          <button type="submit" className={styles.tcPrimary} disabled={busy}>{busy ? '…' : T.save}</button>
          <button type="button" className={styles.tcBtn} onClick={() => { setForm(null); setError('') }} disabled={busy}>{T.close}</button>
          {hint && <span className={styles.tcHint}>{hint}</span>}
        </div>
      </form>
    )
  }

  return (
    <section className={styles.tc} aria-label={T.title}>
      <div className={styles.tcHead}>
        <h2 className={styles.tcTitle}>{T.title}</h2>
        <span className={styles.tcNote}>{T.tzNote}</span>
        <span className={styles.tcSp} />
        <button type="button" className={styles.tcAccent} onClick={() => open({ kind: 'single' })} disabled={!data}>{T.addSingle}</button>
      </div>

      {loadError && (
        <div className={styles.tcError}>{T.loadError} <button type="button" className={styles.tcBtn} onClick={load}>{T.retry}</button></div>
      )}
      {!data && !loadError && <div className={styles.tcHint}>{T.loading}</div>}

      {data && (
        <>
          {renderForm('single')}

          <div className={styles.tcBox}>
            <div className={styles.tcBoxTitle}>{T.fixed}</div>
            {data.series.length === 0 && <div className={styles.tcHint}>{T.noFixed}</div>}
            {data.series.map((s) => (
              <div key={s.id} className={styles.tcFixed} data-testid="series-row">
                <b>{seriesTitle(s.weekday, s.time)}</b>
                <span className={styles.tcMeta}>
                  {T.minutes(s.durationMin)} · {s.startsOn > today ? T.since(dayMonth(s.startsOn)) : s.endsOn ? T.until(dayMonth(s.endsOn)) : T.since(dayMonth(s.startsOn))}
                </span>
                <LinkPill url={s.meetUrl} room={data.zoomUrl} />
                <span className={styles.tcSp} />
                <button type="button" className={styles.tcBtn} onClick={() => open({ kind: 'changeSeries', series: s })} disabled={busy}>{T.change}</button>
                <button type="button" className={styles.tcBtn} onClick={() => endSeries(s)} disabled={busy}>{T.end}</button>
              </div>
            ))}
            {renderForm('series')}
            {!(form && (form.kind === 'newSeries' || form.kind === 'changeSeries')) && (
              <div><button type="button" className={styles.tcAccent} onClick={() => open({ kind: 'newSeries' })}>
                {data.series.length ? T.addOtherFixed : T.addFixed}
              </button></div>
            )}
          </div>

          <div className={styles.tcBox}>
            <div className={styles.tcBoxTitle}>{T.upcoming}</div>
            {data.classes.length === 0 && <div className={styles.tcHint}>{T.none}</div>}
            <ul className={styles.tcRows}>
              {data.classes.map((c) => {
                const t = new Date(c.startsAt)
                const kind = classKind(c)
                const rel = relativeDay(t, now, CLASS_TZ)
                return (
                  <li key={c.key} className={styles.tcRowWrap}>
                    <div className={`${styles.tcRow} ${kind === 'cancelada' ? styles.tcCanc : ''}`} data-testid="class-row">
                      <span className={styles.tcWhen}>
                        <span className={styles.tcD}>{rel ? `${rel}, ` : ''}{shortDate(t, CLASS_TZ)}</span>
                        <span className={styles.tcH}> · {timeRange(t, c.durationMin, CLASS_TZ)}</span>
                      </span>
                      {rel === 'Hoy' && kind !== 'cancelada' && <span className={styles.tcToday}>{T.today}</span>}
                      <span className={`${styles.tcKind} ${styles['k_' + kind]}`}>{T.kinds[kind]}</span>
                      {kind === 'movida' && c.originalStartsAt && <span className={styles.tcWas}>{T.was(shortDate(new Date(c.originalStartsAt), CLASS_TZ).toLowerCase())}</span>}
                      {kind === 'suelta' && <LinkPill url={c.meetUrl} room={data.zoomUrl} />}
                      <span className={styles.tcSp} />
                      {kind !== 'cancelada' && <>
                        <button type="button" className={styles.tcBtn} disabled={busy}
                          onClick={() => open(kind === 'suelta' ? { kind: 'editSingle', c } : { kind: 'move', c })}>{T.edit}</button>
                        <button type="button" className={styles.tcDanger} onClick={() => cancelClass(c)} disabled={busy}>{T.cancel}</button>
                      </>}
                      {kind === 'cancelada' && (
                        <button type="button" className={styles.tcAccent} onClick={() => restore(c)} disabled={busy}>{T.restore}</button>
                      )}
                    </div>
                    {renderForm(c.key)}
                  </li>
                )
              })}
            </ul>
            {data.classes.length > 0 && <div className={styles.tcHint}>{T.showing}</div>}
          </div>
          {error && !form && <div role="alert" className={styles.tcError}>{error}</div>}
        </>
      )}
    </section>
  )
}
