'use client'
// "Usuarios" (admin) y "Alumnos" (profe). Rediseño 2026-11: cada persona con su avatar
// (iniciales), lo que importa a la vista (su profe, cuántos videos y carpetas tiene, su
// próxima clase; de un profe, cuántos alumnos) y sus acciones. El admin además puede
// cambiar el profe de un alumno y BORRAR cuentas de profes y alumnos (con confirmación).
// Solo consume /api/users, /api/users/stats y /api/users/[id]: la seguridad vive allá.
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import styles from './people.module.css'
import cd from './classes.module.css'
import { Modal } from './ClassDialog'
import type { Role } from '@/lib/db/schema'
import { NAME_ERROR, NAME_MAX, normalizePersonName } from '@/lib/personName'
import {
  avatarColor, deleteConsequences, foldersLabel, initials, nextClassText, sortPeople, studentsLabel, videosLabel,
} from '@/lib/peopleView'
import StudentNameDialog from './StudentNameDialog'

interface UserRow {
  id: string
  name: string | null
  email: string | null
  role: Role | null
  teacherId: string | null
}
type Stats = { materialCount: number; folderCount: number; nextClassAt: string | null }

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', profesor: 'Profe', alumno: 'Alumno' }
const FILTER_LABEL = { all: 'Todos', profesor: 'Profes', alumno: 'Alumnos', admin: 'Admins' } as const
const SECTION_LABEL: Record<Role, string> = { profesor: 'Profes', alumno: 'Alumnos', admin: 'Admins' }
const NAME_TITLE: Record<Role, string> = { admin: 'Nombre del admin', profesor: 'Nombre del profe', alumno: 'Nombre del alumno' }

export const PEOPLE_TEXTS = {
  newUser: '+ Nuevo usuario', newStudent: '+ Nuevo alumno',
  createTitleAdmin: 'Nuevo usuario', createTitleTeacher: 'Nuevo alumno',
  noTeacher: 'Sin profe', teacherOf: (n: string) => `Profe: ${n}`,
  open: 'Abrir', rename: 'Cambiar nombre', addName: 'Agregar nombre', changeTeacher: 'Cambiar profe', remove: 'Eliminar',
  noClass: 'Sin clases agendadas', nextClass: (t: string) => `Próxima clase: ${t}`,
  deleteTitle: (n: string) => `Eliminar la cuenta de ${n}`, deleteConfirm: 'Eliminar cuenta', cancel: 'Cancelar',
  deleted: (n: string) => `Se eliminó la cuenta de ${n}.`,
  teacherTitle: (n: string) => `Profe de ${n}`, save: 'Guardar',
} as const

// Íconos chicos para los datos de cada persona (decorativos).
const ICON: Record<string, ReactNode> = {
  teacher: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>,
  video: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><polygon points="10 9 15 12 10 15" fill="currentColor" /></svg>,
  folder: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  people: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20c0-2.8-1.6-4.6-4-5.2" /></svg>,
}

export default function UsersPanel({ role, onOpenStudent }: { role: Role; onOpenStudent?: (id: string, email: string, name: string | null) => void }) {
  const T = PEOPLE_TEXTS
  const isAdmin = role === 'admin'
  const [users, setUsers] = useState<UserRow[]>([])
  const [stats, setStats] = useState<Record<string, Stats>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [now] = useState(() => new Date())

  // alta
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState<Role>('alumno')
  const [teacherId, setTeacherId] = useState('') // '' = sin profe
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  // ventanas
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [removing, setRemoving] = useState<UserRow | null>(null)
  const [reassigning, setReassigning] = useState<UserRow | null>(null)

  // búsqueda / filtro (front)
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')

  const load = useCallback(async () => {
    setLoading(true); setLoadError('')
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

  const teachers = useMemo(() => users.filter((u) => u.role === 'profesor'), [users])
  const labelById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name || u.email])) as Record<string, string | null>, [users])
  const studentCount = useMemo(() => {
    const m: Record<string, number> = {}
    for (const u of users) if (u.role === 'alumno' && u.teacherId) m[u.teacherId] = (m[u.teacherId] ?? 0) + 1
    return m
  }, [users])
  const counts = useMemo(() => ({
    all: users.length,
    profesor: users.filter((u) => u.role === 'profesor').length,
    alumno: users.filter((u) => u.role === 'alumno').length,
    admin: users.filter((u) => u.role === 'admin').length,
  }), [users])

  const filtered = useMemo(() => sortPeople(users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    if (q && !`${u.name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })), [users, q, roleFilter])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError(''); setOkMsg('')
    const fullName = normalizePersonName(name)
    if (!fullName) { setFormError(NAME_ERROR); return }
    const mail = email.trim()
    if (!isValidEmail(mail)) { setFormError('Ingresá un email válido.'); return }

    // El rol a crear sale del rol del creador: un profesor solo crea alumnos.
    const roleToCreate: Role = role === 'profesor' ? 'alumno' : newRole
    const body: Record<string, unknown> = { name: fullName, email: mail, role: roleToCreate }
    if (isAdmin && roleToCreate === 'alumno' && teacherId) body.teacherId = teacherId

    setSubmitting(true)
    try {
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (res.status === 201) {
        setOkMsg(`Usuario creado: ${data.name ?? fullName}`)
        setName(''); setEmail(''); setTeacherId(''); setNewRole('alumno')
        await load()
      } else if (res.status === 409) setFormError('Ya existe un usuario con ese email.')
      else if (res.status === 400) setFormError(data.error || 'Datos inválidos.')
      else if (res.status === 403) setFormError('No tenés permiso para crear ese usuario.')
      else setFormError(data.error || 'No se pudo crear el usuario.')
    } catch {
      setFormError('Error de red al crear el usuario.')
    } finally {
      setSubmitting(false)
    }
  }

  // Lo que se ve de cada persona.
  function facts(u: UserRow): ReactNode[] {
    const out: ReactNode[] = []
    if (u.role === 'alumno') {
      if (isAdmin) {
        out.push(u.teacherId
          ? <span key="t" className={styles.fact}>{ICON.teacher}{T.teacherOf(labelById[u.teacherId] ?? '')}</span>
          : <span key="t" className={`${styles.fact} ${styles.factWarn}`}>{ICON.teacher}{T.noTeacher}</span>)
      }
      const s = stats[u.id]
      if (s) {
        out.push(<span key="v" className={`${styles.fact} ${s.materialCount === 0 ? styles.factSoft : ''}`}>{ICON.video}{videosLabel(s.materialCount)}</span>)
        const fl = foldersLabel(s.folderCount)
        if (fl) out.push(<span key="f" className={styles.fact}>{ICON.folder}{fl}</span>)
        out.push(s.nextClassAt
          ? <span key="c" className={styles.fact}>{ICON.clock}{T.nextClass(nextClassText(s.nextClassAt, now))}</span>
          : <span key="c" className={`${styles.fact} ${styles.factSoft}`}>{ICON.clock}{T.noClass}</span>)
      }
    } else if (u.role === 'profesor') {
      out.push(<span key="s" className={styles.fact}>{ICON.people}{studentsLabel(studentCount[u.id] ?? 0)}</span>)
    }
    return out
  }

  function person(u: UserRow, asCard: boolean) {
    const display = u.name || u.email || ''
    const actions = (
      <div className={styles.acts}>
        {u.role === 'alumno' && onOpenStudent && (
          <button type="button" className={styles.open} onClick={() => onOpenStudent(u.id, u.email ?? '', u.name)}>{T.open}</button>
        )}
        {isAdmin && u.role !== 'alumno' && (
          <button type="button" className={styles.txt} onClick={() => setEditing(u)}>{u.name ? T.rename : T.addName}</button>
        )}
        {isAdmin && u.role === 'alumno' && (
          <button type="button" className={styles.txt} onClick={() => setReassigning(u)}>{T.changeTeacher}</button>
        )}
        {isAdmin && (u.role === 'alumno' || u.role === 'profesor') && (
          <button type="button" className={`${styles.txt} ${styles.danger}`} onClick={() => setRemoving(u)}
            aria-label={`${T.remove} a ${display}`}>{T.remove}</button>
        )}
      </div>
    )
    const f = facts(u)
    const who = (
      <div className={styles.who}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{display}</span>
          {isAdmin && u.role && <span className={styles.role}>{ROLE_LABEL[u.role]}</span>}
        </div>
        {u.name && u.email && <span className={styles.mail}>{u.email}</span>}
        {!u.name && u.role === 'alumno' && <span className={styles.mail}>Sin nombre: agregalo desde su pantalla</span>}
        {f.length > 0 && <div className={styles.facts}>{f}</div>}
      </div>
    )
    const avatar = <span className={`${styles.avatar} ${styles['c' + avatarColor(u.id)]}`} aria-hidden="true">{initials(u.name, u.email)}</span>
    return (
      <li key={u.id} className={`${styles.card} ${asCard ? styles.gridCard : ''}`} data-testid="person">
        {asCard ? <><div className={styles.gridTop}>{avatar}{who}</div>{actions}</> : <>{avatar}{who}{actions}</>}
      </li>
    )
  }

  // Admin con "Todos": por secciones (Profes, Alumnos, Admins). Profe: tarjetas de sus alumnos.
  const sections: { role: Role | null; list: UserRow[] }[] = isAdmin && roleFilter === 'all'
    ? (['profesor', 'alumno', 'admin'] as Role[]).map((r) => ({ role: r, list: filtered.filter((u) => u.role === r) })).filter((s) => s.list.length > 0)
    : [{ role: null, list: filtered }]

  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <input className={styles.search} placeholder="Buscar por nombre o email" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
        {!formOpen && (
          <button type="button" className={styles.newBtn} onClick={() => { setFormOpen(true); setOkMsg('') }}>
            {isAdmin ? T.newUser : T.newStudent}
          </button>
        )}
      </div>

      {isAdmin && (
        <div className={styles.filters} role="group" aria-label="Filtrar por rol">
          {(['all', 'profesor', 'alumno', 'admin'] as const).map((r) => (
            <button key={r} type="button" aria-pressed={roleFilter === r}
              className={`${styles.filter} ${roleFilter === r ? styles.filterOn : ''}`} onClick={() => setRoleFilter(r)}>
              {FILTER_LABEL[r]}<span className={styles.count}>{counts[r]}</span>
            </button>
          ))}
        </div>
      )}

      {formOpen && (
        <form className={styles.form} onSubmit={submit}>
          <h3 className={styles.formTitle}>{isAdmin ? T.createTitleAdmin : T.createTitleTeacher}</h3>
          <div className={styles.formRow}>
            {isAdmin && (
              <label className={styles.field} style={{ flex: '0 1 150px' }}>
                <span className={styles.fieldLbl}>Rol</span>
                <select className={styles.input} value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
                  <option value="alumno">Alumno</option>
                  <option value="profesor">Profe</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            )}
            <label className={styles.field}>
              <span className={styles.fieldLbl}>Nombre y apellido</span>
              <input className={styles.input} maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLbl}>{isAdmin ? 'Email' : 'Email del alumno'}</span>
              <input className={styles.input} type="email" placeholder="email@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {isAdmin && newRole === 'alumno' && (
              <label className={styles.field}>
                <span className={styles.fieldLbl}>Profe</span>
                <select className={styles.input} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                  <option value="">Sin profe</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
                </select>
              </label>
            )}
          </div>
          {!isAdmin && <div className={styles.hint}>El alumno queda asignado a vos automáticamente.</div>}
          {isAdmin && newRole === 'alumno' && teachers.length === 0 && (
            <div className={styles.hint}>Todavía no hay profes cargados; el alumno queda sin profe.</div>
          )}
          {formError && <div className={styles.err} role="alert">{formError}</div>}
          {okMsg && <div className={styles.ok} role="status">{okMsg}</div>}
          <div className={styles.formBtns}>
            <button className={styles.primary} type="submit" disabled={submitting}>
              {submitting ? 'Creando…' : isAdmin ? 'Crear' : 'Crear alumno'}
            </button>
            <button className={styles.ghost} type="button" onClick={() => { setFormOpen(false); setFormError('') }}>Cerrar</button>
          </div>
        </form>
      )}

      {loadError && <div className={styles.err}>{loadError}</div>}

      {loading ? (
        <div className={styles.hint}>Cargando usuarios…</div>
      ) : users.length === 0 ? (
        <div className={styles.empty}>
          {isAdmin ? 'No hay usuarios todavía.' : 'Aún no tenés alumnos. Sumá el primero con "Nuevo alumno".'}
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>No hay resultados para esa búsqueda.</div>
      ) : (
        sections.map((s) => (
          <section key={s.role ?? 'all'} className={styles.section} aria-label={s.role ? SECTION_LABEL[s.role] : undefined}>
            {s.role && <h2 className={styles.sectionTitle}>{SECTION_LABEL[s.role]} <span>{s.list.length}</span></h2>}
            <ul className={isAdmin ? styles.list : styles.grid}>{s.list.map((u) => person(u, !isAdmin))}</ul>
          </section>
        ))
      )}

      {editing && (
        <StudentNameDialog userId={editing.id} name={editing.name} title={editing.role ? NAME_TITLE[editing.role] : undefined}
          onClose={() => setEditing(null)}
          onSaved={(n) => { setUsers((list) => list.map((x) => (x.id === editing.id ? { ...x, name: n } : x))); setEditing(null) }} />
      )}
      {removing && (
        <DeleteUserDialog user={removing} students={studentCount[removing.id] ?? 0}
          onClose={() => setRemoving(null)}
          onDeleted={() => {
            const n = removing.name || removing.email || ''
            setRemoving(null); setOkMsg(T.deleted(n)); load()
          }} />
      )}
      {reassigning && (
        <TeacherDialog user={reassigning} teachers={teachers} onClose={() => setReassigning(null)}
          onSaved={(tid) => { setUsers((list) => list.map((x) => (x.id === reassigning.id ? { ...x, teacherId: tid } : x))); setReassigning(null); load() }} />
      )}
      {okMsg && !formOpen && <div className={styles.ok} role="status">{okMsg}</div>}
    </div>
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
