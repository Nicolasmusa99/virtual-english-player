'use client'
// Calendario (G1) — ventanas estilo Google Calendar del lado PROFE:
//   · ClassDialog: "Nueva clase" / "Editar clase" (fecha, horario, repetición, fin, Zoom).
//   · ScopeDialog: al editar o cancelar una clase que se repite, "Solo esta clase /
//     Esta y las siguientes / Todas las clases".
// Solo arman el borrador (lib/classDraft.ts); qué se le pide a la API lo decide
// useClassEditor. Todo en hora de Argentina (la del profe).
// G2: desde "Mi agenda" la ventana muestra el alumno (y lo deja elegir al crear).
// Rediseño (fase 5): cada fila con su nombre a la izquierda ("Cuándo", "Repetición",
// "Zoom"…) en vez de íconos; sin "·".
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import styles from './classes.module.css'
import { weekdayOf } from '@/lib/classSchedule'
import {
  DAY_CHIPS, WEEK_ORDER, addMinutes, draftDuration, draftError, durationLabel, repeatLabel,
  type ClassDraft, type RepeatMode,
} from '@/lib/classDraft'
import { WEEKDAYS } from '@/lib/classView'

export const DIALOG_TEXTS = {
  create: 'Nueva clase',
  edit: 'Editar clase',
  student: 'Alumno',
  pickStudent: 'Elegí el alumno…',
  noStudent: 'Elegí el alumno',
  editSeries: 'Editar el horario',
  close: 'Cerrar',
  when: 'Cuándo',
  date: 'Fecha', start: 'Empieza', end: 'Termina a las',
  repeat: 'Repetición',
  none: 'No se repite',
  custom: 'Personalizado… (elegir días)',
  days: 'Días',
  ends: 'Termina',
  never: 'Nunca',
  onDay: 'El día…',
  endsOn: 'Último día',
  zoom: 'Zoom',
  room: 'Mi sala de Zoom',
  change: 'Cambiar',
  useRoom: 'Usar Mi sala de Zoom',
  link: 'Link de Zoom de esta clase',
  linkPh: 'https://…zoom.us/j/…',
  noRoom: 'Pegá el link de Zoom. Si cargás "Mi sala de Zoom" en el inicio, se usa sola.',
  tz: 'Hora de Argentina. El alumno la ve en su hora.',
  cancel: 'Cancelar', save: 'Guardar',
  scopeEdit: 'Editar clase que se repite',
  scopeCancel: 'Cancelar clase que se repite',
  only: 'Solo esta clase', following: 'Esta y las siguientes', all: 'Todas las clases',
  onlyCancelHint: '(queda "Cancelada")', followingCancelHint: '(termina el horario)', allCancelHint: '(borra el horario)',
  onlyDisabled: 'Cambiaste cómo se repite: aplica a esta y las siguientes, o a todas.',
  accept: 'Aceptar', back: 'Volver', cancelClasses: 'Cancelar clases',
} as const

export type Scope = 'only' | 'following' | 'all'
export type StudentOption = { id: string; label: string }

// Fondo + caja centrada. Escape cierra; el foco arranca en la ventana.
export function Modal({ label, onClose, children, wide }: { label: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus() ?? ref.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={styles.cdBackdrop}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`${styles.cdBox} ${wide ? styles.cdWide : ''}`}>
        {children}
      </div>
    </div>
  )
}

const shortUrl = (u: string) => u.replace(/^https:\/\//, '').slice(0, 28) + (u.length > 36 ? '…' : '')

type DialogProps = {
  mode: 'create' | 'edit' | 'editSeries'
  initial: ClassDraft
  zoomUrl: string | null
  /** Editar una clase de un horario: no se ofrece "No se repite". */
  lockRepeat?: boolean
  /** "Mi agenda" (G2): de qué alumno es. `locked` = se muestra pero no se cambia. */
  student?: { options: StudentOption[]; value: string | null; locked: boolean }
  busy: boolean
  error: string
  onSave: (d: ClassDraft, studentId?: string) => void
  onClose: () => void
}

export function ClassDialog({ mode, initial, zoomUrl, lockRepeat, student, busy, error, onSave, onClose }: DialogProps) {
  const T = DIALOG_TEXTS
  const [d, setD] = useState<ClassDraft>(initial)
  const [who, setWho] = useState(student?.value ?? '')
  const [endsMode, setEndsMode] = useState<'never' | 'on'>(initial.endsOn ? 'on' : 'never')
  const [ownLink, setOwnLink] = useState(!zoomUrl || !!initial.link)
  const [localError, setLocalError] = useState('')
  const title = mode === 'create' ? T.create : mode === 'editSeries' ? T.editSeries : T.edit
  const set = (p: Partial<ClassDraft>) => { setLocalError(''); setD((x) => ({ ...x, ...p })) }
  const dur = draftDuration(d)
  const weekday = /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? weekdayOf(d.date) : null

  // El día de la fecha y los días de "Personalizado" (si son otros), como opciones.
  const customLabel = d.repeat === 'custom' && d.days.length ? repeatLabel(d.days) : T.custom

  function changeStart(start: string) {
    // Como Google: mover el inicio corre el fin y mantiene la duración.
    const keep = draftDuration(d)
    set({ start, end: keep !== null && /^\d\d:\d\d$/.test(start) ? addMinutes(start, keep) : d.end })
  }
  function toggleDay(day: number) {
    set({ days: d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day] })
  }
  function save() {
    const draft = { ...d, endsOn: d.repeat !== 'none' && endsMode === 'on' ? d.endsOn : null, link: ownLink ? d.link : '' }
    const err = student && !who ? T.noStudent : draftError(draft)
    if (err) { setLocalError(err); return }
    onSave(draft, student ? who : undefined)
  }
  const pickFirst = !!student && !student.locked && !who

  return (
    <Modal label={title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className={styles.cdHead}>
          <h3 className={styles.cdTitle}>{title}</h3>
          <button type="button" className={styles.cdX} onClick={onClose} aria-label={T.close}>×</button>
        </div>

        {student && (
          <div className={styles.cdLine}>
            <span className={styles.cdKey} aria-hidden="true">{T.student}</span>
            <div className={styles.cdVals}>
              {student.locked ? (
                <b className={styles.cdRoom} data-testid="dialog-student">{student.options.find((o) => o.id === who)?.label ?? ''}</b>
              ) : (
                <label className={styles.cdField}><span className={styles.cdSr}>{T.student}</span>
                  <select data-autofocus={pickFirst || undefined} className={styles.cdInput} value={who}
                    onChange={(e) => { setLocalError(''); setWho(e.target.value) }}>
                    <option value="" disabled>{T.pickStudent}</option>
                    {student.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>
        )}

        <div className={styles.cdLine}>
          <span className={styles.cdKey} aria-hidden="true">{T.when}</span>
          <div className={styles.cdVals}>
            <label className={`${styles.cdField} ${styles.cdDateField}`}><span className={styles.cdSr}>{T.date}</span>
              <input data-autofocus={!pickFirst || undefined} className={styles.cdInput} type="date" required value={d.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
            <label className={styles.cdField}><span className={styles.cdSr}>{T.start}</span>
              <input className={styles.cdInput} type="time" required value={d.start} onChange={(e) => changeStart(e.target.value)} />
            </label>
            <span className={styles.cdDash}>–</span>
            <label className={styles.cdField}><span className={styles.cdSr}>{T.end}</span>
              <input className={styles.cdInput} type="time" required value={d.end} onChange={(e) => set({ end: e.target.value })} />
            </label>
            {dur !== null && <span className={styles.cdDur}>{durationLabel(dur)}</span>}
          </div>
        </div>

        <div className={styles.cdLine}>
          <span className={styles.cdKey} aria-hidden="true">{T.repeat}</span>
          <div className={styles.cdVals}>
            <label className={styles.cdField}><span className={styles.cdSr}>{T.repeat}</span>
              <select className={styles.cdInput} value={d.repeat}
                onChange={(e) => {
                  const repeat = e.target.value as RepeatMode
                  set({ repeat, days: repeat === 'custom' && d.days.length === 0 && weekday !== null ? [weekday] : d.days })
                }}>
                {!lockRepeat && <option value="none">{T.none}</option>}
                {weekday !== null && <option value="weekly">{repeatLabel([weekday])}</option>}
                <option value="custom">{customLabel}</option>
              </select>
            </label>
          </div>
        </div>

        {d.repeat === 'custom' && (
          <div className={styles.cdLine}>
            <span className={styles.cdKey} aria-hidden="true">{T.days}</span>
            <div className={styles.cdChips} role="group" aria-label={T.days}>
              {WEEK_ORDER.map((day) => (
                <button key={day} type="button" aria-pressed={d.days.includes(day)} title={WEEKDAYS[day]}
                  className={`${styles.cdChip} ${d.days.includes(day) ? styles.cdChipOn : ''}`} onClick={() => toggleDay(day)}>
                  {DAY_CHIPS[day]}
                </button>
              ))}
            </div>
          </div>
        )}

        {d.repeat !== 'none' && (
          <div className={styles.cdLine}>
            <span className={styles.cdKey} aria-hidden="true">{T.ends}</span>
            <div className={styles.cdVals}>
              <select className={styles.cdInput} aria-label={T.ends} value={endsMode}
                onChange={(e) => {
                  const m = e.target.value as 'never' | 'on'
                  setEndsMode(m)
                  if (m === 'on' && !d.endsOn) set({ endsOn: d.date })
                }}>
                <option value="never">{T.never}</option>
                <option value="on">{T.onDay}</option>
              </select>
              {endsMode === 'on' && (
                <label className={styles.cdField}><span className={styles.cdSr}>{T.endsOn}</span>
                  <input className={styles.cdInput} type="date" required value={d.endsOn ?? ''} min={d.date} onChange={(e) => set({ endsOn: e.target.value })} />
                </label>
              )}
            </div>
          </div>
        )}

        <div className={styles.cdLine}>
          <span className={styles.cdKey} aria-hidden="true">{T.zoom}</span>
          {!ownLink && zoomUrl ? (
            <div className={styles.cdVals}>
              <b className={styles.cdRoom}>{T.room}</b>
              <span className={styles.cdUrl}>{shortUrl(zoomUrl)}</span>
              <button type="button" className={styles.cdTxtBtn} onClick={() => setOwnLink(true)}>{T.change}</button>
            </div>
          ) : (
            <div className={styles.cdLinkBox}>
              <label className={styles.cdField}><span className={styles.cdLbl}>{T.link}</span>
                <input className={styles.cdInput} type="url" inputMode="url" placeholder={T.linkPh} value={d.link} onChange={(e) => set({ link: e.target.value })} />
              </label>
              {zoomUrl
                ? <button type="button" className={styles.tcBtn} onClick={() => { setOwnLink(false); set({ link: '' }) }}>{T.useRoom}</button>
                : <span className={styles.tcHint}>{T.noRoom}</span>}
            </div>
          )}
        </div>

        <div className={styles.cdTz}>{T.tz}</div>
        {(localError || error) && <div role="alert" className={styles.tcError}>{localError || error}</div>}
        <div className={styles.cdBtns}>
          <button type="button" className={styles.tcBtn} onClick={onClose} disabled={busy}>{T.cancel}</button>
          <button type="submit" className={styles.tcPrimary} disabled={busy}>{busy ? '…' : T.save}</button>
        </div>
      </form>
    </Modal>
  )
}

type ScopeProps = {
  kind: 'edit' | 'cancel'
  /** false si cambió la repetición: "Solo esta clase" no aplica. */
  allowOnly: boolean
  busy: boolean
  error: string
  onConfirm: (s: Scope) => void
  onClose: () => void
}

export function ScopeDialog({ kind, allowOnly, busy, error, onConfirm, onClose }: ScopeProps) {
  const T = DIALOG_TEXTS
  const [scope, setScope] = useState<Scope>(allowOnly ? 'only' : 'following')
  const name = useId()
  const title = kind === 'edit' ? T.scopeEdit : T.scopeCancel
  const opts: Array<[Scope, string, string]> = [
    ['only', T.only, kind === 'cancel' ? T.onlyCancelHint : ''],
    ['following', T.following, kind === 'cancel' ? T.followingCancelHint : ''],
    ['all', T.all, kind === 'cancel' ? T.allCancelHint : ''],
  ]
  return (
    <Modal label={title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onConfirm(scope) }}>
        <h3 className={styles.cdTitle}>{title}</h3>
        <div role="radiogroup" aria-label={title} className={styles.cdRadios}>
          {opts.map(([v, label, hint]) => (
            <label key={v} className={`${styles.cdRadio} ${v === 'only' && !allowOnly ? styles.cdRadioOff : ''}`}>
              <input type="radio" name={name} value={v} aria-label={label} checked={scope === v} disabled={v === 'only' && !allowOnly}
                data-autofocus={scope === v ? true : undefined} onChange={() => setScope(v)} />
              <span>{label}</span>{hint && <span className={styles.tcHint}>{hint}</span>}
            </label>
          ))}
        </div>
        {!allowOnly && <div className={styles.tcHint}>{T.onlyDisabled}</div>}
        {error && <div role="alert" className={styles.tcError}>{error}</div>}
        <div className={styles.cdBtns}>
          <button type="button" className={styles.tcBtn} onClick={onClose} disabled={busy}>{kind === 'edit' ? T.cancel : T.back}</button>
          <button type="submit" className={kind === 'edit' ? styles.tcPrimary : styles.cdDangerBtn} disabled={busy}>
            {busy ? '…' : kind === 'edit' ? T.accept : T.cancelClasses}
          </button>
        </div>
      </form>
    </Modal>
  )
}
