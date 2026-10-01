'use client'
// Calendario (C3; G1) — sección "Clases" en la pantalla de un alumno (lado PROFE / ADMIN).
// G1: se crea y se edita como en Google Calendar — "+ Nueva clase" abre una ventana con
// fecha, horario, repetición (uno o varios días), fin y Zoom (ClassDialog). Al editar o
// cancelar una clase que se repite se pregunta "Solo esta / Esta y las siguientes /
// Todas" (ScopeDialog). Todo en hora de Argentina (en la que carga el profe). Solo habla
// con /api/classes/** — quién puede tocar qué lo decide el servidor (lib/classAccess.ts).
import { useCallback, useEffect, useState } from 'react'
import styles from './classes.module.css'
import { CLASS_TZ, dateInTz, weekdayOf } from '@/lib/classSchedule'
import {
  classKind, dayMonth, formDate, formTime, meetLabel, relativeDay, seriesTitle, shortDate, timeRange,
  type TeacherClass,
} from '@/lib/classView'
import { addMinutes, draftWeekdays, repeatChanged, seriesBody, singleBody, type ClassDraft } from '@/lib/classDraft'
import { ClassDialog, ScopeDialog, type Scope } from './ClassDialog'

type Series = { id: string; weekdays: number[]; time: string; durationMin: number; startsOn: string; endsOn: string | null; meetUrl: string | null }

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
  confirmCancel: (d: string) => `¿Cancelar la clase del ${d}? El alumno la va a ver cancelada.`,
  loading: 'Cargando clases…',
  loadError: 'No se pudieron cargar las clases.',
  retry: 'Reintentar',
  saveError: 'No se pudo guardar.',
  minutes: (n: number) => `${n} min`,
  since: (d: string) => `desde el ${d}`,
  until: (d: string) => `hasta el ${d}`,
  between: (a: string, b: string) => `del ${a} al ${b}`,
} as const

// De qué es el link de una clase/horario. Sin link propio → "Mi sala de Zoom" (si hay).
function LinkPill({ url, room }: { url: string | null; room: string | null }) {
  const label = url ? meetLabel(url) : room ? TEACHER_CLASS_TEXTS.room : null
  return label ? <span className={styles.tcPill}>{label}</span> : null
}

// Qué ventana está abierta.
type Open =
  | { kind: 'create' }
  | { kind: 'editSingle'; c: TeacherClass }
  | { kind: 'editOccurrence'; c: TeacherClass; s: Series }
  | { kind: 'editSeries'; s: Series }
  | { kind: 'scopeEdit'; c: TeacherClass; s: Series; draft: ClassDraft; allowOnly: boolean }
  | { kind: 'scopeCancel'; c: TeacherClass }

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

// El borrador de la ventana a partir de lo que ya existe.
const repeatOf = (weekdays: number[], date: string): Pick<ClassDraft, 'repeat' | 'days'> =>
  weekdays.length === 1 && weekdays[0] === weekdayOf(date) ? { repeat: 'weekly', days: [] } : { repeat: 'custom', days: weekdays }

function draftFromClass(c: TeacherClass, s?: Series): ClassDraft {
  const t = new Date(c.startsAt)
  const start = formTime(t), date = formDate(t)
  return {
    date, start, end: addMinutes(start, c.durationMin),
    ...(s ? repeatOf(s.weekdays, date) : { repeat: 'none' as const, days: [] }),
    endsOn: s?.endsOn ?? null,
    link: (s ? s.meetUrl : c.meetUrl) ?? '',
  }
}
function draftFromSeries(s: Series): ClassDraft {
  return { date: s.startsOn, start: s.time, end: addMinutes(s.time, s.durationMin), ...repeatOf(s.weekdays, s.startsOn), endsOn: s.endsOn, link: s.meetUrl ?? '' }
}
const sameDraft = (a: ClassDraft, b: ClassDraft) => JSON.stringify({ ...a, days: draftWeekdays(a) }) === JSON.stringify({ ...b, days: draftWeekdays(b) })

export default function TeacherClasses({ studentId }: { studentId: string }) {
  const T = TEACHER_CLASS_TEXTS
  const [data, setData] = useState<{ series: Series[]; classes: TeacherClass[]; zoomUrl: string | null } | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [open, setOpen] = useState<Open | null>(null)
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
  const show = (next: Open | null) => { setError(''); setOpen(next) }

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setError('')
    const r = await action()
    setBusy(false)
    if (!r.ok) { setError(r.error ?? T.saveError); return }
    setOpen(null)
    await load()
  }

  // La clase "real" del horario (para una movida, la original).
  const occurrence = (c: TeacherClass) => c.originalStartsAt ?? c.startsAt
  const seriesOf = (c: TeacherClass) => data?.series.find((s) => s.id === c.seriesId)

  function edit(c: TeacherClass) {
    const s = seriesOf(c)
    show(c.seriesId && s ? { kind: 'editOccurrence', c, s } : { kind: 'editSingle', c })
  }

  // Guardar desde la ventana.
  function save(d: ClassDraft) {
    if (!open) return
    if (open.kind === 'create') {
      return run(() => d.repeat === 'none'
        ? send('/api/classes/events', 'POST', { studentId, ...singleBody(d) })
        : send('/api/classes/series', 'POST', { studentId, ...seriesBody(d) }))
    }
    if (open.kind === 'editSingle') {
      const id = open.c.eventId
      return run(() => d.repeat === 'none'
        ? send(`/api/classes/events/${id}`, 'PATCH', singleBody(d))
        : send('/api/classes/series', 'POST', { studentId, ...seriesBody(d), replacesEventId: id })) // pasa a repetirse
    }
    if (open.kind === 'editSeries') {
      return run(() => send(`/api/classes/series/${open.s.id}`, 'PATCH', { scope: 'all', ...seriesBody(d) }))
    }
    if (open.kind === 'editOccurrence') {
      const before = draftFromClass(open.c, open.s)
      if (sameDraft(before, d)) { show(null); return }
      show({ kind: 'scopeEdit', c: open.c, s: open.s, draft: d, allowOnly: !repeatChanged(before, d) })
    }
  }

  function applyScope(scope: Scope) {
    if (!open) return
    if (open.kind === 'scopeEdit') {
      const { c, s, draft } = open
      const body = seriesBody(draft)
      if (scope === 'only') {
        return run(() => send('/api/classes/events', 'POST', {
          seriesId: s.id, originalStartsAt: occurrence(c), action: 'move', ...singleBody(draft),
        }))
      }
      if (scope === 'following') {
        return run(() => send(`/api/classes/series/${s.id}`, 'PATCH', { scope: 'following', occurrence: occurrence(c), ...body }))
      }
      // "Todas": el horario sigue empezando cuando empezaba (no se manda startsOn).
      const all: Partial<typeof body> = { ...body }
      delete all.startsOn
      return run(() => send(`/api/classes/series/${s.id}`, 'PATCH', { scope: 'all', ...all }))
    }
    if (open.kind === 'scopeCancel') {
      const c = open.c
      if (scope === 'only') return run(() => send('/api/classes/events', 'POST', { seriesId: c.seriesId, originalStartsAt: occurrence(c), action: 'cancel' }))
      const q = scope === 'following' ? `?scope=following&occurrence=${encodeURIComponent(occurrence(c))}` : '?scope=all'
      return run(() => send(`/api/classes/series/${c.seriesId}${q}`, 'DELETE'))
    }
  }

  const label = (c: TeacherClass) => shortDate(new Date(c.startsAt), CLASS_TZ).toLowerCase()

  function cancelClass(c: TeacherClass) {
    if (c.seriesId) { show({ kind: 'scopeCancel', c }); return }
    if (!window.confirm(T.confirmCancel(label(c)))) return
    run(() => send(`/api/classes/events/${c.eventId}`, 'PATCH', { status: 'cancelled' }))
  }
  function restore(c: TeacherClass) {
    // Una clase del horario cancelada/movida vuelve al horario borrando la excepción;
    // una suelta cancelada vuelve a "programada".
    run(() => c.seriesId ? send(`/api/classes/events/${c.eventId}`, 'DELETE') : send(`/api/classes/events/${c.eventId}`, 'PATCH', { status: 'scheduled' }))
  }

  const dialog = (() => {
    if (!open || !data) return null
    const close = () => show(null)
    const common = { zoomUrl: data.zoomUrl, busy, error, onSave: save, onClose: close }
    if (open.kind === 'create') {
      return <ClassDialog {...common} mode="create" initial={{ date: today, start: '18:00', end: '19:00', repeat: 'none', days: [], endsOn: null, link: '' }} />
    }
    if (open.kind === 'editSingle') return <ClassDialog {...common} mode="edit" initial={draftFromClass(open.c)} />
    if (open.kind === 'editOccurrence') return <ClassDialog {...common} mode="edit" lockRepeat initial={draftFromClass(open.c, open.s)} />
    if (open.kind === 'editSeries') return <ClassDialog {...common} mode="editSeries" lockRepeat initial={draftFromSeries(open.s)} />
    return (
      <ScopeDialog kind={open.kind === 'scopeEdit' ? 'edit' : 'cancel'} allowOnly={open.kind === 'scopeEdit' ? open.allowOnly : true}
        busy={busy} error={error} onConfirm={applyScope} onClose={close} />
    )
  })()

  return (
    <section className={styles.tc} aria-label={T.title}>
      <div className={styles.tcHead}>
        <h2 className={styles.tcTitle}>{T.title}</h2>
        <span className={styles.tcNote}>{T.tzNote}</span>
        <span className={styles.tcSp} />
        <button type="button" className={styles.tcPrimary} onClick={() => show({ kind: 'create' })} disabled={!data}>{T.add}</button>
      </div>

      {loadError && (
        <div className={styles.tcError}>{T.loadError} <button type="button" className={styles.tcBtn} onClick={load}>{T.retry}</button></div>
      )}
      {!data && !loadError && <div className={styles.tcHint}>{T.loading}</div>}

      {data && (
        <>
          <div className={styles.tcBox}>
            <div className={styles.tcBoxTitle}>{T.fixed}</div>
            {data.series.length === 0 && <div className={styles.tcHint}>{T.noFixed}</div>}
            {data.series.map((s) => (
              <div key={s.id} className={styles.tcFixed} data-testid="series-row">
                <b>{seriesTitle(s.weekdays, s.time)}</b>
                <span className={styles.tcMeta}>
                  {T.minutes(s.durationMin)} · {
                    s.startsOn > today && s.endsOn ? T.between(dayMonth(s.startsOn), dayMonth(s.endsOn))
                      : s.startsOn > today || !s.endsOn ? T.since(dayMonth(s.startsOn)) : T.until(dayMonth(s.endsOn))}
                </span>
                <LinkPill url={s.meetUrl} room={data.zoomUrl} />
                <span className={styles.tcSp} />
                <button type="button" className={styles.tcBtn} onClick={() => show({ kind: 'editSeries', s })} disabled={busy}>{T.edit}</button>
              </div>
            ))}
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
                        <button type="button" className={styles.tcBtn} disabled={busy} onClick={() => edit(c)}>{T.edit}</button>
                        <button type="button" className={styles.tcDanger} onClick={() => cancelClass(c)} disabled={busy}>{T.cancel}</button>
                      </>}
                      {kind === 'cancelada' && (
                        <button type="button" className={styles.tcAccent} onClick={() => restore(c)} disabled={busy}>{T.restore}</button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
            {data.classes.length > 0 && <div className={styles.tcHint}>{T.showing}</div>}
          </div>
          {error && !open && <div role="alert" className={styles.tcError}>{error}</div>}
        </>
      )}
      {dialog}
    </section>
  )
}
