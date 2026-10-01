'use client'
// Calendario (G1; G2) — crear, editar, cancelar y restaurar clases desde cualquier
// pantalla del PROFE: la sección "Clases" de un alumno (TeacherClasses) y "Mi agenda"
// (MyAgenda). Abre las ventanas de G1 (ClassDialog / ScopeDialog) y decide qué pedirle
// a /api/classes/** según lo elegido ("Solo esta / Esta y las siguientes / Todas").
// Quién puede tocar qué lo decide el servidor (lib/classAccess.ts).
import { useState } from 'react'
import { CLASS_TZ, dateInTz, weekdayOf } from '@/lib/classSchedule'
import { formDate, formTime, shortDate, type TeacherClass } from '@/lib/classView'
import { addMinutes, draftWeekdays, repeatChanged, seriesBody, singleBody, type ClassDraft } from '@/lib/classDraft'
import { ClassDialog, ScopeDialog, type Scope, type StudentOption } from './ClassDialog'

export type Series = { id: string; weekdays: number[]; time: string; durationMin: number; startsOn: string; endsOn: string | null; meetUrl: string | null }

export const EDITOR_TEXTS = {
  saveError: 'No se pudo guardar.',
  confirmCancel: (d: string) => `¿Cancelar la clase del ${d}? El alumno la va a ver cancelada.`,
} as const

// Qué ventana está abierta (y de qué alumno; null = se elige en la ventana).
type Open =
  | { kind: 'create'; studentId: string | null; initial: ClassDraft }
  | { kind: 'editSingle'; studentId: string; c: TeacherClass }
  | { kind: 'editOccurrence'; studentId: string; c: TeacherClass; s: Series }
  | { kind: 'editSeries'; studentId: string; s: Series }
  | { kind: 'scopeEdit'; studentId: string; c: TeacherClass; s: Series; draft: ClassDraft; allowOnly: boolean }
  | { kind: 'scopeCancel'; studentId: string; c: TeacherClass }

type Result = { ok: boolean; error?: string }
async function send(url: string, method: string, body?: unknown): Promise<Result> {
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

// La clase "real" del horario (para una movida, la original).
const occurrence = (c: TeacherClass) => c.originalStartsAt ?? c.startsAt

export const emptyDraft = (p: Partial<ClassDraft> = {}): ClassDraft => ({
  date: dateInTz(new Date(), CLASS_TZ), start: '18:00', end: '19:00', repeat: 'none', days: [], endsOn: null, link: '', ...p,
})

export function useClassEditor({ zoomUrl, series, reload, students }: {
  zoomUrl: string | null
  /** Los horarios de las clases que se muestran (para saber de cuál es cada una). */
  series: Series[]
  reload: () => Promise<void> | void
  /** "Mi agenda": la ventana muestra el alumno (y lo deja elegir al crear). */
  students?: StudentOption[]
}) {
  const [open, setOpen] = useState<Open | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const show = (next: Open | null) => { setError(''); setOpen(next) }

  async function run(action: () => Promise<Result>) {
    setBusy(true); setError('')
    const r = await action()
    setBusy(false)
    if (!r.ok) { setError(r.error ?? EDITOR_TEXTS.saveError); return }
    setOpen(null)
    await reload()
  }

  const seriesOf = (c: TeacherClass) => series.find((s) => s.id === c.seriesId)

  // ── Lo que pueden pedir las pantallas ──
  const create = (studentId: string | null, initial: Partial<ClassDraft> = {}) => show({ kind: 'create', studentId, initial: emptyDraft(initial) })
  const editSeries = (studentId: string, s: Series) => show({ kind: 'editSeries', studentId, s })
  function edit(studentId: string, c: TeacherClass) {
    const s = seriesOf(c)
    show(c.seriesId && s ? { kind: 'editOccurrence', studentId, c, s } : { kind: 'editSingle', studentId, c })
  }
  function cancel(studentId: string, c: TeacherClass) {
    if (c.seriesId) { show({ kind: 'scopeCancel', studentId, c }); return }
    if (!window.confirm(EDITOR_TEXTS.confirmCancel(shortDate(new Date(c.startsAt), CLASS_TZ).toLowerCase()))) return
    run(() => send(`/api/classes/events/${c.eventId}`, 'PATCH', { status: 'cancelled' }))
  }
  function restore(c: TeacherClass) {
    // Una clase del horario cancelada/movida vuelve al horario borrando la excepción;
    // una suelta cancelada vuelve a "programada".
    run(() => c.seriesId ? send(`/api/classes/events/${c.eventId}`, 'DELETE') : send(`/api/classes/events/${c.eventId}`, 'PATCH', { status: 'scheduled' }))
  }

  // Guardar desde la ventana.
  function save(d: ClassDraft, pickedStudent?: string) {
    if (!open) return
    if (open.kind === 'create') {
      const studentId = pickedStudent ?? open.studentId
      return run(() => d.repeat === 'none'
        ? send('/api/classes/events', 'POST', { studentId, ...singleBody(d) })
        : send('/api/classes/series', 'POST', { studentId, ...seriesBody(d) }))
    }
    if (open.kind === 'editSingle') {
      const id = open.c.eventId
      return run(() => d.repeat === 'none'
        ? send(`/api/classes/events/${id}`, 'PATCH', singleBody(d))
        : send('/api/classes/series', 'POST', { studentId: open.studentId, ...seriesBody(d), replacesEventId: id })) // pasa a repetirse
    }
    if (open.kind === 'editSeries') {
      return run(() => send(`/api/classes/series/${open.s.id}`, 'PATCH', { scope: 'all', ...seriesBody(d) }))
    }
    if (open.kind === 'editOccurrence') {
      const before = draftFromClass(open.c, open.s)
      if (sameDraft(before, d)) { show(null); return }
      show({ kind: 'scopeEdit', studentId: open.studentId, c: open.c, s: open.s, draft: d, allowOnly: !repeatChanged(before, d) })
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

  const dialog = (() => {
    if (!open) return null
    const close = () => show(null)
    if (open.kind === 'scopeEdit' || open.kind === 'scopeCancel') {
      return (
        <ScopeDialog kind={open.kind === 'scopeEdit' ? 'edit' : 'cancel'} allowOnly={open.kind === 'scopeEdit' ? open.allowOnly : true}
          busy={busy} error={error} onConfirm={applyScope} onClose={close} />
      )
    }
    const student = students ? { options: students, value: open.studentId, locked: open.kind !== 'create' } : undefined
    const common = { zoomUrl, busy, error, onSave: save, onClose: close, student }
    if (open.kind === 'create') return <ClassDialog {...common} mode="create" initial={open.initial} />
    if (open.kind === 'editSingle') return <ClassDialog {...common} mode="edit" initial={draftFromClass(open.c)} />
    if (open.kind === 'editOccurrence') return <ClassDialog {...common} mode="edit" lockRepeat initial={draftFromClass(open.c, open.s)} />
    return <ClassDialog {...common} mode="editSeries" lockRepeat initial={draftFromSeries(open.s)} />
  })()

  return { dialog, isOpen: open !== null, busy, error, create, edit, editSeries, cancel, restore }
}
