'use client'
// "Usuarios" (admin) y "Alumnos" (profe). Rediseño 2026-11, a lo Classroom:
//   · Profe: una tarjeta por alumno, toda tocable, con lo que importa de un vistazo (cuánto
//     material tiene, en cuántas carpetas y su próxima clase; si es hoy, marcada). Se puede
//     ordenar por nombre o por próxima clase.
//   · Admin: una tabla por sección (Profes, Alumnos, Admins) con columnas, y las acciones de
//     cada fila en su menú "⋯" (cambiar nombre, cambiar profe, eliminar). Un filtro rápido
//     muestra los alumnos sin profe.
//   · El alta va en una ventana; lo que pasó se avisa abajo.
// Solo consume /api/users, /api/users/stats y /api/users/[id]: la seguridad vive allá.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import styles from './people.module.css'
import ms from './material.module.css'
import cd from './classes.module.css'
import { Modal } from './ClassDialog'
import ActionMenu, { type MenuItem } from './ActionMenu'
import type { Role } from '@/lib/db/schema'
import { NAME_ERROR, NAME_MAX, normalizePersonName } from '@/lib/personName'
import { CLASS_TZ } from '@/lib/classSchedule'
import { deleteConsequences, nextClassText, sortPeople, studentsLabel, videosLabel } from '@/lib/peopleView'
import Avatar from './Avatar'
import { PASSWORD_MIN, makePassword, passwordProblem } from '@/lib/passwordRules'
import { byNextClass, isSameDayInTz } from '@/lib/materialView'
import StudentNameDialog from './StudentNameDialog'
import type { LastWatched } from '@/lib/people'
import { lastSeenText, progressText } from '@/lib/progressView'
import { displayVideoName } from '@/lib/studentView'

interface UserRow {
  id: string
  name: string | null
  email: string | null
  role: Role | null
  teacherId: string | null
  image?: string | null
  hasPassword?: boolean
}
type Stats = { materialCount: number; folderCount: number; nextClassAt: string | null; lastWatched?: LastWatched | null }
type Filter = 'all' | Role | 'noTeacher'

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
const FILTER_LABEL: Record<Filter, string> = { all: 'Todos', profesor: 'Profes', alumno: 'Alumnos', admin: 'Admins', noTeacher: 'Sin profe' }
const SECTION_LABEL: Record<Role, string> = { profesor: 'Profes', alumno: 'Alumnos', admin: 'Admins' }
const NAME_TITLE: Record<Role, string> = { admin: 'Nombre del admin', profesor: 'Nombre del profe', alumno: 'Nombre del alumno' }

export const PEOPLE_TEXTS = {
  newUser: '+ Nuevo usuario', newStudent: '+ Nuevo alumno',
  createTitleAdmin: 'Nuevo usuario', createTitleTeacher: 'Nuevo alumno',
  noTeacher: 'Sin profe', teacherOf: (n: string) => `Profe: ${n}`,
  open: 'Abrir', rename: 'Cambiar nombre', addName: 'Agregar nombre', changeTeacher: 'Cambiar profe', remove: 'Eliminar',
  more: (n: string) => `Acciones de ${n}`,
  noClass: 'Sin clases agendadas', nextClass: (t: string) => `Próxima clase: ${t}`,
  deleteTitle: (n: string) => `Eliminar la cuenta de ${n}`, deleteConfirm: 'Eliminar cuenta', cancel: 'Cancelar',
  deleted: (n: string) => `Se eliminó la cuenta de ${n}.`,
  created: (n: string) => `Usuario creado: ${n}`,
  teacherTitle: (n: string) => `Profe de ${n}`, save: 'Guardar',
  resetPassword: 'Cambiar contraseña',
  resetTitle: (n: string) => `Nueva contraseña de ${n}`,
  resetNote: 'Se cierran las sesiones que tenga abiertas. Pasale la nueva para que vuelva a entrar.',
  resetDone: (n: string) => `Se cambió la contraseña de ${n}.`,
  accessLabel: 'Cómo entra',
  accessGoogle: 'Con Google', accessPassword: 'Con mail y contraseña',
  accessGoogleHint: 'Entra con la cuenta de Google de ese mail.',
  accessPasswordHint: 'Le armás una contraseña. Después la puede cambiar desde su perfil.',
  email: 'Mail', password: 'Contraseña', generate: 'Generar una', show: 'Ver', hide: 'Ocultar',
  credsTitle: (n: string) => `Cuenta creada para ${n}`,
  credsNote: 'Pasale estos datos para que entre. La contraseña no se vuelve a mostrar.',
  copy: 'Copiar los datos', copied: 'Copiado', done: 'Listo',
  sort: 'Ordenar', sortName: 'Nombre', sortNext: 'Próxima clase',
  colName: 'Nombre', colTeacher: 'Profe', colMaterial: 'Material', colNext: 'Próxima clase', colStudents: 'Alumnos',
  statMaterial: 'Material', statFolders: 'Carpetas', statNext: 'Próxima clase',
  statLast: 'Lo último que vio', notWatched: 'Todavía no abrió ningún video',
  noFolders: 'Ninguna', notScheduled: 'Sin agendar',
  noName: 'Sin nombre',
} as const

export default function UsersPanel({ role, onOpenStudent }: { role: Role; onOpenStudent?: (id: string, email: string, name: string | null) => void }) {
  const T = PEOPLE_TEXTS
  const isAdmin = role === 'admin'
  const [users, setUsers] = useState<UserRow[]>([])
  const [stats, setStats] = useState<Record<string, Stats>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [now] = useState(() => new Date())

  // ventanas
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [removing, setRemoving] = useState<UserRow | null>(null)
  const [reassigning, setReassigning] = useState<UserRow | null>(null)
  const [resetting, setResetting] = useState<UserRow | null>(null)
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string } | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // búsqueda / filtro / orden (front)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sortBy, setSortBy] = useState<'name' | 'next'>('name')

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setUsers(data.users ?? [])
    } catch {
      setLoadError('No se pudieron cargar los usuarios.')
    } finally {
      setLoading(false)
    }
    // El resumen (videos, carpetas, próxima clase) llega aparte: si falla, la lista igual se ve.
    try {
      const res = await fetch('/api/users/stats')
      if (res.ok) setStats((await res.json()).stats ?? {})
    } catch { /* sin resumen */ }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  function say(text: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(text)
    toastTimer.current = setTimeout(() => setToast(''), 6000)
  }

  const teachers = useMemo(() => users.filter((u) => u.role === 'profesor'), [users])
  const labelById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name || u.email])) as Record<string, string | null>, [users])
  const studentCount = useMemo(() => {
    const m: Record<string, number> = {}
    for (const u of users) if (u.role === 'alumno' && u.teacherId) m[u.teacherId] = (m[u.teacherId] ?? 0) + 1
    return m
  }, [users])
  const counts: Record<Filter, number> = useMemo(() => ({
    all: users.length,
    profesor: users.filter((u) => u.role === 'profesor').length,
    alumno: users.filter((u) => u.role === 'alumno').length,
    admin: users.filter((u) => u.role === 'admin').length,
    noTeacher: users.filter((u) => u.role === 'alumno' && !u.teacherId).length,
  }), [users])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = users.filter((u) => {
      if (filter === 'noTeacher' ? !(u.role === 'alumno' && !u.teacherId) : filter !== 'all' && u.role !== filter) return false
      if (needle && !`${u.name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(needle)) return false
      return true
    })
    return sortBy === 'next' ? byNextClass(list, (u) => stats[u.id]?.nextClassAt ?? null) : sortPeople(list)
  }, [users, q, filter, sortBy, stats])

  const display = (u: UserRow) => u.name || u.email || ''
  const avatar = (u: UserRow, big = false) => <Avatar id={u.id} name={u.name} email={u.email} image={u.image} size={big ? 52 : 40} />
  // Debajo del nombre: el mail.
  const subline = (u: UserRow) => (u.name && u.email) || ''
  const nextNode = (s: Stats | undefined, withLabel: boolean) => {
    if (!s) return <span className={styles.soft}>…</span>
    if (!s.nextClassAt) return <span className={styles.soft}>{withLabel ? T.noClass : T.notScheduled}</span>
    const text = nextClassText(s.nextClassAt, now)
    const today = isSameDayInTz(s.nextClassAt, now, CLASS_TZ)
    return <span className={today ? styles.today : undefined}>{withLabel ? T.nextClass(text) : text}</span>
  }
  // 2026-11: el último video que abrió el alumno y dónde lo dejó.
  const lastNode = (s: Stats | undefined) => {
    if (!s) return <span className={styles.soft}>…</span>
    const w = s.lastWatched
    if (!w) return <span className={styles.soft}>{T.notWatched}</span>
    return (
      <>
        <span className={styles.lastName}>{displayVideoName(w.videoName)}</span>
        <span className={styles.soft}>{progressText(w.positionSec, w.durationSec)}, {lastSeenText(w.seenAt, now)}</span>
      </>
    )
  }
  const menuFor = (u: UserRow): MenuItem[] => {
    const items: MenuItem[] = [{ label: u.name ? T.rename : T.addName, onSelect: () => setEditing(u) }]
    if (u.role === 'alumno') items.push({ label: T.changeTeacher, onSelect: () => setReassigning(u) })
    if (u.hasPassword) items.push({ label: T.resetPassword, onSelect: () => setResetting(u) })
    if (u.role === 'alumno' || u.role === 'profesor') items.push({ kind: 'sep' }, { label: T.remove, danger: true, onSelect: () => setRemoving(u) })
    return items
  }
  const open = (u: UserRow) => onOpenStudent?.(u.id, u.email ?? '', u.name)

  // ── Profe: tarjetas ──
  function card(u: UserRow) {
    const s = stats[u.id]
    return (
      <li key={u.id} data-testid="person">
        <button type="button" className={styles.card} onClick={() => open(u)} disabled={!onOpenStudent}>
          <span className={styles.cardTop}>
            {avatar(u, true)}
            <span className={styles.who}>
              <span className={styles.name}>{display(u)}</span>
              {subline(u) && <span className={styles.mail}>{subline(u)}</span>}
              {!u.name && <span className={styles.mail}>{T.noName}</span>}
            </span>
          </span>
          <span className={styles.stats}>
            <span className={styles.stat}><span className={styles.statLbl}>{T.statMaterial}</span>
              <span className={s && s.materialCount === 0 ? styles.soft : undefined}>{s ? videosLabel(s.materialCount) : '…'}</span></span>
            <span className={styles.stat}><span className={styles.statLbl}>{T.statFolders}</span>
              <span className={s && s.folderCount === 0 ? styles.soft : undefined}>{s ? (s.folderCount || T.noFolders) : '…'}</span></span>
            <span className={`${styles.stat} ${styles.statWide}`}><span className={styles.statLbl}>{T.statNext}</span>{nextNode(s, false)}</span>
            <span className={`${styles.stat} ${styles.statWide}`} data-testid="last-watched"><span className={styles.statLbl}>{T.statLast}</span>{lastNode(s)}</span>
          </span>
          <span className={styles.cardCta}>{T.open}</span>
        </button>
      </li>
    )
  }

  // ── Admin: filas de tabla ──
  // Rediseño (2026-11-04, más limpio): una línea por dato, con elipsis; el nombre abre al
  // alumno (botón de toda la celda); las acciones viven en el "⋯" y una flecha aparece al
  // pasar por la fila.
  function row(u: UserRow, cols: Role) {
    const s = stats[u.id]
    const isStudent = u.role === 'alumno'
    const opens = isStudent && !!onOpenStudent
    const teacher = u.teacherId ? users.find((x) => x.id === u.teacherId) : null
    const who = (
      <>
        {avatar(u)}
        <span className={styles.who}>
          <span className={styles.name}>{display(u)}</span>
          {u.name && u.email
            ? <span className={styles.mail}>{u.email}</span>
            : <span className={styles.mail}>{T.noName}</span>}
        </span>
      </>
    )
    return (
      <li key={u.id} data-testid="person" className={`${styles.row} ${styles['cols_' + cols]} ${opens ? styles.rowLink : ''}`}
        onClick={opens ? () => open(u) : undefined}>
        {opens
          ? <button type="button" className={`${styles.cellWho} ${styles.whoBtn}`} aria-label={`${T.open} ${display(u)}`}
              onClick={(e) => { e.stopPropagation(); open(u) }}>{who}</button>
          : <span className={styles.cellWho}>{who}</span>}
        {cols === 'alumno' && (
          <>
            <span className={styles.cell} data-label={T.colTeacher}>
              {teacher
                ? <span className={styles.teacher}><Avatar id={teacher.id} name={teacher.name} email={teacher.email} image={teacher.image} size={22} /><span className={styles.ellipsis}>{teacher.name || teacher.email}</span></span>
                : u.teacherId ? <span className={styles.soft}>…</span> : <span className={styles.warn}>{T.noTeacher}</span>}
            </span>
            <span className={styles.cell} data-label={T.colMaterial}>
              {s ? <span className={s.materialCount === 0 ? styles.soft : undefined}>{videosLabel(s.materialCount)}{s.folderCount > 0 && <span className={styles.soft}>, {s.folderCount === 1 ? '1 carpeta' : `${s.folderCount} carpetas`}</span>}</span> : '…'}
            </span>
            <span className={styles.cell} data-label={T.colNext}>{nextNode(s, false)}</span>
          </>
        )}
        {cols === 'profesor' && (
          <span className={styles.cell} data-label={T.colStudents}>
            <span className={(studentCount[u.id] ?? 0) === 0 ? styles.soft : undefined}>{studentsLabel(studentCount[u.id] ?? 0)}</span>
          </span>
        )}
        <span className={styles.cellActs} onClick={(e) => e.stopPropagation()}>
          <ActionMenu label={T.more(display(u))} items={opens ? [{ label: T.open, onSelect: () => open(u) }, { kind: 'sep' }, ...menuFor(u)] : menuFor(u)} />
          {opens && <svg className={styles.chev} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>}
        </span>
      </li>
    )
  }
  const head = (cols: Role) => (
    <div className={`${styles.thead} ${styles['cols_' + cols]}`} aria-hidden="true">
      <span>{T.colName}</span>
      {cols === 'alumno' && <><span>{T.colTeacher}</span><span>{T.colMaterial}</span><span>{T.colNext}</span></>}
      {cols === 'profesor' && <span>{T.colStudents}</span>}
      <span />
    </div>
  )

  // Admin con "Todos": por secciones. Con un filtro, una sola tabla del rol que corresponde.
  const sections: { role: Role; titled: boolean; list: UserRow[] }[] = !isAdmin
    ? []
    : filter === 'all'
      ? (['profesor', 'alumno', 'admin'] as Role[]).map((r) => ({ role: r, titled: true, list: filtered.filter((u) => u.role === r) })).filter((s) => s.list.length > 0)
      : [{ role: filter === 'noTeacher' ? 'alumno' : filter, titled: false, list: filtered }]
  const showSort = !isAdmin || filter === 'alumno' || filter === 'noTeacher'

  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <input className={`${ms.search} ${styles.search}`} type="search" placeholder="Buscar por nombre o email" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        {showSort && (
          <label className={styles.sort}>{T.sort}
            <select className={ms.select} value={sortBy} onChange={(e) => setSortBy(e.target.value as 'name' | 'next')}>
              <option value="name">{T.sortName}</option>
              <option value="next">{T.sortNext}</option>
            </select>
          </label>
        )}
        <button type="button" className={`${ms.btn} ${ms.btnPri} ${styles.newBtn}`} onClick={() => setCreating(true)}>
          {isAdmin ? T.newUser : T.newStudent}
        </button>
      </div>

      {isAdmin && (
        <div className={styles.filters} role="group" aria-label="Filtrar por rol">
          <span className={styles.segment}>
          {(['all', 'profesor', 'alumno', 'admin'] as const).map((r) => (
            <button key={r} type="button" aria-pressed={filter === r}
              className={`${styles.filter} ${filter === r ? styles.filterOn : ''}`} onClick={() => setFilter(r)}>
              {FILTER_LABEL[r]}<span className={styles.count}>{counts[r]}</span>
            </button>
          ))}
          </span>
          {counts.noTeacher > 0 && (
            <button type="button" aria-pressed={filter === 'noTeacher'}
              className={`${styles.filter} ${styles.filterWarn} ${filter === 'noTeacher' ? styles.filterOn : ''}`} onClick={() => setFilter(filter === 'noTeacher' ? 'all' : 'noTeacher')}>
              {FILTER_LABEL.noTeacher}<span className={styles.count}>{counts.noTeacher}</span>
            </button>
          )}
        </div>
      )}

      {loadError && <div className={ms.err}>{loadError}</div>}

      {loading ? (
        <div className={styles.skeletons} aria-label="Cargando usuarios…">
          {[0, 1, 2].map((i) => <div key={i} className={styles.skeleton} />)}
        </div>
      ) : users.length === 0 ? (
        <div className={ms.emptyCard}>
          <h3 className={ms.emptyTitle}>{isAdmin ? 'No hay usuarios todavía.' : 'Aún no tenés alumnos.'}</h3>
          {!isAdmin && <p className={ms.muted}>Sumá el primero: le llega el acceso con su cuenta de Google.</p>}
          <div className={ms.emptyBtns}>
            <button type="button" className={`${ms.btn} ${ms.btnPri}`} onClick={() => setCreating(true)}>{isAdmin ? T.newUser : T.newStudent}</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>No hay resultados para esa búsqueda.</div>
      ) : !isAdmin ? (
        <ul className={styles.grid}>{filtered.map(card)}</ul>
      ) : (
        sections.map((s) => (
          <section key={s.role} className={styles.section} aria-label={s.titled ? SECTION_LABEL[s.role] : undefined}>
            {s.titled && <h2 className={styles.sectionTitle}>{SECTION_LABEL[s.role]} <span>{s.list.length}</span></h2>}
            <div className={styles.table}>
              {head(s.role)}
              <ul className={styles.rows}>{s.list.map((u) => row(u, s.role))}</ul>
            </div>
          </section>
        ))
      )}

      {creating && (
        <CreateDialog isAdmin={isAdmin} teachers={teachers} onClose={() => setCreating(false)}
          onCreated={(n, creds) => { setCreating(false); if (creds) setCredentials({ name: n, ...creds }); else say(T.created(n)); load() }} />
      )}
      {credentials && <CredentialsDialog {...credentials} onClose={() => { setCredentials(null); say(T.created(credentials.name)) }} />}
      {resetting && (
        <PasswordResetDialog user={resetting} onClose={() => setResetting(null)}
          onSaved={(creds) => { const n = display(resetting); setResetting(null); setCredentials({ name: n, ...creds }) }} />
      )}
      {editing && (
        <StudentNameDialog userId={editing.id} name={editing.name} title={editing.role ? NAME_TITLE[editing.role] : undefined}
          onClose={() => setEditing(null)}
          onSaved={(n) => { setUsers((list) => list.map((x) => (x.id === editing.id ? { ...x, name: n } : x))); setEditing(null) }} />
      )}
      {removing && (
        <DeleteUserDialog user={removing} students={studentCount[removing.id] ?? 0}
          onClose={() => setRemoving(null)}
          onDeleted={() => { const n = display(removing); setRemoving(null); say(T.deleted(n)); load() }} />
      )}
      {reassigning && (
        <TeacherDialog user={reassigning} teachers={teachers} onClose={() => setReassigning(null)}
          onSaved={(tid) => { setUsers((list) => list.map((x) => (x.id === reassigning.id ? { ...x, teacherId: tid } : x))); setReassigning(null); load() }} />
      )}
      {toast && (
        <div className={ms.toast} role="status">
          <span>{toast}</span>
          <button type="button" className={ms.toastX} aria-label="Cerrar aviso" onClick={() => setToast('')}>×</button>
        </div>
      )}
    </div>
  )
}

// ── Alta (ventana) ──
// Nombre y apellido y mail, siempre. El admin elige además cómo entra: con Google (con ese
// mail) o con mail y contraseña. El profe da de alta alumnos con Google.
function CreateDialog({ isAdmin, teachers, onClose, onCreated }: {
  isAdmin: boolean; teachers: UserRow[]; onClose: () => void
  onCreated: (name: string, creds?: { email: string; password: string }) => void
}) {
  const T = PEOPLE_TEXTS
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState<Role>('alumno')
  const [teacherId, setTeacherId] = useState('') // '' = sin profe
  const [access, setAccess] = useState<'google' | 'password'>('google')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const title = isAdmin ? T.createTitleAdmin : T.createTitleTeacher
  const withPassword = isAdmin && access === 'password'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    const fullName = normalizePersonName(name)
    if (!fullName) { setFormError(NAME_ERROR); return }
    const mail = email.trim()
    if (!isValidEmail(mail)) { setFormError('Ingresá un email válido.'); return }
    const pwProblem = withPassword ? passwordProblem(password) : null
    if (pwProblem) { setFormError(pwProblem); return }

    // El rol a crear sale del rol del creador: un profesor solo crea alumnos.
    const roleToCreate: Role = isAdmin ? newRole : 'alumno'
    const body: Record<string, unknown> = { name: fullName, email: mail, role: roleToCreate }
    if (withPassword) Object.assign(body, { access: 'password', password })
    if (isAdmin && roleToCreate === 'alumno' && teacherId) body.teacherId = teacherId

    setSubmitting(true)
    try {
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (res.status === 201) onCreated(data.name ?? fullName, withPassword ? { email: mail.toLowerCase(), password } : undefined)
      else if (res.status === 409) setFormError(data.error || 'Ya existe un usuario con ese email.')
      else if (res.status === 400) setFormError(data.error || 'Datos inválidos.')
      else if (res.status === 403) setFormError('No tenés permiso para crear ese usuario.')
      else setFormError(data.error || 'No se pudo crear el usuario.')
    } catch {
      setFormError('Error de red al crear el usuario.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal label={title} onClose={onClose}>
      <form onSubmit={submit} className={styles.form}>
        <h3 className={cd.cdTitle}>{title}</h3>
        {isAdmin && (
          <div className={styles.roles} role="radiogroup" aria-label="Rol">
            {(['alumno', 'profesor', 'admin'] as Role[]).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={newRole === r}
                className={`${ms.chip} ${newRole === r ? ms.chipOn : ''}`} onClick={() => setNewRole(r)}>
                {r === 'alumno' ? 'Alumno' : r === 'profesor' ? 'Profe' : 'Admin'}
              </button>
            ))}
          </div>
        )}
        <label className={styles.field}>
          <span className={styles.fieldLbl}>Nombre y apellido</span>
          <input data-autofocus className={ms.input} maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLbl}>{isAdmin ? 'Email' : 'Email del alumno'}</span>
          <input className={ms.input} type="email" placeholder="email@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          {!isAdmin && <span className={styles.hint}>Entra con esta cuenta de Google.</span>}
        </label>

        {isAdmin && (
          <fieldset className={styles.access}>
            <legend className={styles.fieldLbl}>{T.accessLabel}</legend>
            <div className={styles.accessOpts} role="radiogroup" aria-label={T.accessLabel}>
              {(['google', 'password'] as const).map((a) => (
                <button key={a} type="button" role="radio" aria-checked={access === a}
                  className={`${styles.accessOpt} ${access === a ? styles.accessOn : ''}`} onClick={() => setAccess(a)}>
                  <b>{a === 'google' ? T.accessGoogle : T.accessPassword}</b>
                  <span>{a === 'google' ? T.accessGoogleHint : T.accessPasswordHint}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {withPassword && (
          <>
            <label className={styles.field}>
              <span className={styles.fieldLbl}>{T.password}</span>
              <span className={styles.pwRow}>
                <input className={ms.input} type={showPw ? 'text' : 'password'} autoComplete="new-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className={ms.linkBtn} onClick={() => setShowPw((v) => !v)}>{showPw ? T.hide : T.show}</button>
              </span>
            </label>
            <div className={styles.pwHelp}>
              <span className={styles.hint}>Al menos {PASSWORD_MIN} caracteres.</span>
              <button type="button" className={ms.linkBtn} onClick={() => { setPassword(makePassword()); setShowPw(true) }}>{T.generate}</button>
            </div>
          </>
        )}

        {isAdmin && newRole === 'alumno' && (
          <label className={styles.field}>
            <span className={styles.fieldLbl}>Profe</span>
            <select className={ms.input} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Sin profe</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
            </select>
            {teachers.length === 0 && <span className={styles.hint}>Todavía no hay profes cargados; el alumno queda sin profe.</span>}
          </label>
        )}
        {!isAdmin && <div className={styles.hint}>El alumno queda asignado a vos automáticamente.</div>}
        {formError && <div className={ms.err} style={{ margin: 0 }} role="alert">{formError}</div>}
        <div className={cd.cdBtns}>
          <button className={cd.tcBtn} type="button" onClick={onClose}>{T.cancel}</button>
          <button className={cd.tcPrimary} type="submit" disabled={submitting}>
            {submitting ? 'Creando…' : isAdmin ? 'Crear' : 'Crear alumno'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Los datos para entrar, recién creados (o la contraseña nueva) ──
function CredentialsDialog({ name, email, password, onClose }: { name: string; email: string; password: string; onClose: () => void }) {
  const T = PEOPLE_TEXTS
  const [copied, setCopied] = useState(false)
  const text = `Virtual English\nMail: ${email}\nContraseña: ${password}\n${typeof window !== 'undefined' ? window.location.origin : ''}`
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true) } catch { /* sin portapapeles: se ve igual */ }
  }
  return (
    <Modal label={T.credsTitle(name)} onClose={onClose}>
      <h3 className={cd.cdTitle}>{T.credsTitle(name)}</h3>
      <p className={cd.tcHint} style={{ margin: '0 0 14px', fontSize: 16 }}>{T.credsNote}</p>
      <dl className={styles.creds}>
        <dt>{T.email}</dt><dd>{email}</dd>
        <dt>{T.password}</dt><dd>{password}</dd>
      </dl>
      <div className={cd.cdBtns}>
        <button type="button" className={cd.tcBtn} onClick={copy}>{copied ? T.copied : T.copy}</button>
        <button type="button" className={cd.tcPrimary} onClick={onClose} data-autofocus>{T.done}</button>
      </div>
    </Modal>
  )
}

// ── Cambiar la contraseña de alguien (admin) ──
function PasswordResetDialog({ user, onClose, onSaved }: { user: UserRow; onClose: () => void; onSaved: (c: { email: string; password: string }) => void }) {
  const T = PEOPLE_TEXTS
  const [password, setPassword] = useState(() => makePassword())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const display = user.name || user.email || ''
  async function save(e: FormEvent) {
    e.preventDefault()
    const p = passwordProblem(password)
    if (p) { setError(p); return }
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(typeof data?.error === 'string' ? data.error : 'No se pudo cambiar la contraseña.'); return }
      onSaved({ email: user.email ?? '', password })
    } catch { setError('No se pudo cambiar la contraseña.') } finally { setBusy(false) }
  }
  return (
    <Modal label={T.resetTitle(display)} onClose={onClose}>
      <form onSubmit={save} className={styles.form}>
        <h3 className={cd.cdTitle}>{T.resetTitle(display)}</h3>
        <label className={styles.field}>
          <span className={styles.fieldLbl}>{T.password}</span>
          <span className={styles.pwRow}>
            <input data-autofocus className={ms.input} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className={ms.linkBtn} onClick={() => setPassword(makePassword())}>{T.generate}</button>
          </span>
        </label>
        <p className={cd.tcHint} style={{ margin: 0 }}>{T.resetNote}</p>
        {error && <div role="alert" className={cd.tcError}>{error}</div>}
        <div className={cd.cdBtns}>
          <button type="button" className={cd.tcBtn} onClick={onClose} disabled={busy}>{T.cancel}</button>
          <button type="submit" className={cd.tcPrimary} disabled={busy}>{busy ? '…' : T.save}</button>
        </div>
      </form>
    </Modal>
  )
}

// ── Borrar una cuenta (admin) ──
function DeleteUserDialog({ user, students, onClose, onDeleted }: { user: UserRow; students: number; onClose: () => void; onDeleted: () => void }) {
  const T = PEOPLE_TEXTS
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const display = user.name || user.email || ''
  async function remove() {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(typeof data?.error === 'string' ? data.error : 'No se pudo eliminar la cuenta.'); return }
      onDeleted()
    } catch { setError('No se pudo eliminar la cuenta.') } finally { setBusy(false) }
  }
  return (
    <Modal label={T.deleteTitle(display)} onClose={onClose}>
      <h3 className={cd.cdTitle}>{T.deleteTitle(display)}</h3>
      <ul className={styles.consequences}>
        {deleteConsequences(user.role === 'profesor' ? 'profesor' : 'alumno', students).map((c) => <li key={c}>{c}</li>)}
      </ul>
      {error && <div role="alert" className={cd.tcError} style={{ marginTop: 12 }}>{error}</div>}
      <div className={cd.cdBtns}>
        <button type="button" className={cd.tcBtn} onClick={onClose} disabled={busy} data-autofocus>{T.cancel}</button>
        <button type="button" className={cd.cdDangerBtn} onClick={remove} disabled={busy}>{busy ? '…' : T.deleteConfirm}</button>
      </div>
    </Modal>
  )
}

// ── Cambiar el profe de un alumno (admin) ──
function TeacherDialog({ user, teachers, onClose, onSaved }: { user: UserRow; teachers: UserRow[]; onClose: () => void; onSaved: (teacherId: string | null) => void }) {
  const T = PEOPLE_TEXTS
  const [value, setValue] = useState(user.teacherId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const display = user.name || user.email || ''
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const teacherId = value || null
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacherId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(typeof data?.error === 'string' ? data.error : 'No se pudo cambiar el profe.'); return }
      onSaved(teacherId)
    } catch { setError('No se pudo cambiar el profe.') } finally { setBusy(false) }
  }
  return (
    <Modal label={T.teacherTitle(display)} onClose={onClose}>
      <form onSubmit={save}>
        <h3 className={cd.cdTitle}>{T.teacherTitle(display)}</h3>
        <label className={cd.cdField}>
          <span className={cd.cdLbl}>Profe</span>
          <select data-autofocus className={cd.cdInput} value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">{T.noTeacher}</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
          </select>
        </label>
        <p className={cd.tcHint} style={{ margin: '8px 0 0' }}>Las clases que ya tenía con su profe anterior no pasan al nuevo.</p>
        {error && <div role="alert" className={cd.tcError} style={{ marginTop: 10 }}>{error}</div>}
        <div className={cd.cdBtns}>
          <button type="button" className={cd.tcBtn} onClick={onClose} disabled={busy}>{T.cancel}</button>
          <button type="submit" className={cd.tcPrimary} disabled={busy}>{busy ? '…' : T.save}</button>
        </div>
      </form>
    </Modal>
  )
}

