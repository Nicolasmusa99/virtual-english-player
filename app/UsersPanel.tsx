'use client'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import styles from './page.module.css'
import type { Role } from '@/lib/db/schema'
import { NAME_ERROR, NAME_MAX, normalizePersonName } from '@/lib/personName'
import StudentNameDialog from './StudentNameDialog'

interface UserRow {
  id: string
  name: string | null
  email: string | null
  role: Role | null
  teacherId: string | null
}

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
// Rediseño (fase 5): nombres de los roles con palabras (sin minúsculas crudas ni "·").
const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', profesor: 'Profe', alumno: 'Alumno' }
const FILTER_LABEL = { all: 'Todos', admin: 'Admins', profesor: 'Profes', alumno: 'Alumnos' } as const
const NAME_TITLE: Record<Role, string> = { admin: 'Nombre del admin', profesor: 'Nombre del profe', alumno: 'Nombre del alumno' }

// Fase 3a — cara visible de /api/users (Fase 2). Solo consume GET/POST existentes;
// la seguridad real vive en el backend. El `role` decide qué vista mostrar.
// Nombre y apellido (obligatorio en el alta): el alumno se ve así en la agenda y en la invitación.
export default function UsersPanel({ role, onOpenStudent }: { role: Role; onOpenStudent?: (id: string, email: string, name: string | null) => void }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // form crear
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState<Role>('alumno')
  const [teacherId, setTeacherId] = useState('') // '' = sin profe (teacherId null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  // "Cambiar nombre" de un profe o admin (vista admin; el alumno se cambia desde su pantalla)
  const [editing, setEditing] = useState<UserRow | null>(null)

  // búsqueda / filtro (front-only)
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')

  async function load() {
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
  }
  useEffect(() => { load() }, [])

  const teachers = useMemo(() => users.filter(u => u.role === 'profesor'), [users])
  const labelById = useMemo(
    () => Object.fromEntries(users.map(u => [u.id, u.name || u.email])) as Record<string, string | null>,
    [users]
  )

  const filtered = useMemo(() => users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    if (q && !`${u.name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [users, q, roleFilter])

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
    if (role === 'admin' && roleToCreate === 'alumno' && teacherId) body.teacherId = teacherId

    setSubmitting(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 201) {
        setOkMsg(`Usuario creado: ${data.name ?? fullName}`)
        setName(''); setEmail(''); setTeacherId(''); setNewRole('alumno')
        await load()
      } else if (res.status === 409) {
        setFormError('Ya existe un usuario con ese email.')
      } else if (res.status === 400) {
        setFormError(data.error || 'Datos inválidos.')
      } else if (res.status === 403) {
        setFormError('No tenés permiso para crear ese usuario.')
      } else {
        setFormError(data.error || 'No se pudo crear el usuario.')
      }
    } catch {
      setFormError('Error de red al crear el usuario.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* CREAR — vista admin */}
      {role === 'admin' && (
        <form className={styles.usersForm} onSubmit={submit}>
          <div className={styles.usersFormRow}>
            <select className={styles.usersInput} value={newRole} onChange={e => setNewRole(e.target.value as Role)}>
              <option value="admin">Admin</option>
              <option value="profesor">Profesor</option>
              <option value="alumno">Alumno</option>
            </select>
            <input className={styles.usersInput} placeholder="Nombre y apellido" aria-label="Nombre y apellido" maxLength={NAME_MAX}
              value={name} onChange={e => setName(e.target.value)} />
            <input className={styles.usersInput} type="email" placeholder="email@ejemplo.com" aria-label="Email"
              value={email} onChange={e => setEmail(e.target.value)} />
            {newRole === 'alumno' && (
              <select className={styles.usersInput} value={teacherId} onChange={e => setTeacherId(e.target.value)}>
                <option value="">Sin profe</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
              </select>
            )}
            <button className={styles.restoreBtn} type="submit" disabled={submitting}>{submitting ? 'Creando…' : 'Crear'}</button>
          </div>
          {newRole === 'alumno' && teachers.length === 0 && (
            <div className={styles.progSub}>Todavía no hay profesores cargados; el alumno quedará sin profe.</div>
          )}
          {formError && <div className={styles.errorBox}>{formError}</div>}
          {okMsg && <div className={styles.usersOk}>{okMsg}</div>}
        </form>
      )}

      {/* CREAR — vista profesor (solo alumno; el backend lo asigna a este profe) */}
      {role === 'profesor' && (
        <form className={styles.usersForm} onSubmit={submit}>
          <div className={styles.usersFormRow}>
            <input className={styles.usersInput} placeholder="Nombre y apellido" aria-label="Nombre y apellido" maxLength={NAME_MAX}
              value={name} onChange={e => setName(e.target.value)} />
            <input className={styles.usersInput} type="email" placeholder="Email del alumno" aria-label="Email del alumno"
              value={email} onChange={e => setEmail(e.target.value)} />
            <button className={styles.restoreBtn} type="submit" disabled={submitting}>{submitting ? 'Creando…' : 'Crear alumno'}</button>
          </div>
          <div className={styles.usersMeta}>El alumno queda asignado a vos automáticamente.</div>
          {formError && <div className={styles.errorBox}>{formError}</div>}
          {okMsg && <div className={styles.usersOk}>{okMsg}</div>}
        </form>
      )}

      {/* BÚSQUEDA + FILTRO */}
      <div className={styles.usersToolbar}>
        <input className={styles.usersSearch} placeholder="Buscar por nombre o email…" aria-label="Buscar" value={q} onChange={e => setQ(e.target.value)} />
        {role === 'admin' && (
          <div className={styles.usersFilters}>
            {(['all', 'admin', 'profesor', 'alumno'] as const).map(r => (
              <button key={r} type="button"
                className={`${styles.usersFilterChip} ${roleFilter === r ? styles.usersFilterChipOn : ''}`}
                onClick={() => setRoleFilter(r)}>
                {FILTER_LABEL[r]}
              </button>
            ))}
          </div>
        )}
      </div>

      {loadError && <div className={styles.errorBox}>{loadError}</div>}

      {loading ? (
        <div className={styles.progSub}>Cargando usuarios…</div>
      ) : users.length === 0 ? (
        <div className={styles.progSub}>
          {role === 'profesor'
            ? 'Aún no tenés alumnos. Creá el primero con el formulario de arriba.'
            : 'No hay usuarios todavía.'}
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.progSub}>No hay resultados para esa búsqueda.</div>
      ) : (
        <>
          <div className={styles.progSub}>{filtered.length} {filtered.length === 1 ? 'usuario' : 'usuarios'}</div>
          <div className={styles.list}>
            {filtered.map(u => (
              <div key={u.id} className={styles.row}>
                <span className={styles.rowText}>
                  <span className={styles.rowName}>{u.name || u.email}</span>
                  {(() => {
                    const meta = [
                      u.name ? u.email : u.role === 'alumno' ? 'Sin nombre: agregalo desde su pantalla' : null,
                      u.role === 'alumno' && role === 'admin' ? `profe: ${u.teacherId ? (labelById[u.teacherId] ?? 'sin profe') : 'sin profe'}` : null,
                    ].filter(Boolean).join(', ')
                    return meta ? <span className={styles.usersMeta}>{meta}</span> : null
                  })()}
                </span>
                <span className={`${styles.chip} ${styles.chipSrt}`}>{u.role ? ROLE_LABEL[u.role] : ''}</span>
                {u.role === 'alumno' && onOpenStudent && (
                  <button className={styles.tbBtn} onClick={() => onOpenStudent(u.id, u.email ?? '', u.name)}>Abrir</button>
                )}
                {role === 'admin' && u.role !== 'alumno' && (
                  <button className={styles.tbBtn} onClick={() => setEditing(u)}>{u.name ? 'Cambiar nombre' : 'Agregar nombre'}</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {editing && (
        <StudentNameDialog userId={editing.id} name={editing.name} title={editing.role ? NAME_TITLE[editing.role] : undefined}
          onClose={() => setEditing(null)}
          onSaved={(name) => { setUsers((list) => list.map((x) => (x.id === editing.id ? { ...x, name } : x))); setEditing(null) }} />
      )}
    </div>
  )
}
