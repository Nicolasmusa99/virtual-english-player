'use client'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import styles from './page.module.css'
import type { Role } from '@/lib/db/schema'

interface UserRow {
  id: string
  email: string | null
  role: Role | null
  teacherId: string | null
}

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

// Fase 3a — cara visible de /api/users (Fase 2). Solo consume GET/POST existentes;
// la seguridad real vive en el backend. El `role` decide qué vista mostrar.
export default function UsersPanel({ role }: { role: Role }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // form crear
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState<Role>('alumno')
  const [teacherId, setTeacherId] = useState('') // '' = sin profe (teacherId null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [okMsg, setOkMsg] = useState('')

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
  const emailById = useMemo(
    () => Object.fromEntries(users.map(u => [u.id, u.email])) as Record<string, string | null>,
    [users]
  )

  const filtered = useMemo(() => users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    if (q && !(u.email ?? '').toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [users, q, roleFilter])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError(''); setOkMsg('')
    const mail = email.trim()
    if (!isValidEmail(mail)) { setFormError('Ingresá un email válido.'); return }

    // El rol a crear sale del rol del creador: un profesor solo crea alumnos.
    const roleToCreate: Role = role === 'profesor' ? 'alumno' : newRole
    const body: Record<string, unknown> = { email: mail, role: roleToCreate }
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
        setOkMsg(`Usuario creado: ${data.email ?? mail}`)
        setEmail(''); setTeacherId(''); setNewRole('alumno')
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
            <input className={styles.usersInput} type="email" placeholder="email@ejemplo.com"
              value={email} onChange={e => setEmail(e.target.value)} />
            {newRole === 'alumno' && (
              <select className={styles.usersInput} value={teacherId} onChange={e => setTeacherId(e.target.value)}>
                <option value="">— sin profe —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.email}</option>)}
              </select>
            )}
            <button className={styles.tbBtn} type="submit" disabled={submitting}>{submitting ? 'Creando…' : 'Crear'}</button>
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
            <input className={styles.usersInput} type="email" placeholder="email del alumno"
              value={email} onChange={e => setEmail(e.target.value)} />
            <button className={styles.tbBtn} type="submit" disabled={submitting}>{submitting ? 'Creando…' : 'Crear alumno'}</button>
          </div>
          <div className={styles.progSub}>El alumno queda asignado a vos automáticamente.</div>
          {formError && <div className={styles.errorBox}>{formError}</div>}
          {okMsg && <div className={styles.usersOk}>{okMsg}</div>}
        </form>
      )}

      {/* BÚSQUEDA + FILTRO */}
      <div className={styles.usersToolbar}>
        <input className={styles.usersSearch} placeholder="Buscar por email…" value={q} onChange={e => setQ(e.target.value)} />
        {role === 'admin' && (
          <div className={styles.usersFilters}>
            {(['all', 'admin', 'profesor', 'alumno'] as const).map(r => (
              <button key={r} type="button"
                className={`${styles.usersFilterChip} ${roleFilter === r ? styles.usersFilterChipOn : ''}`}
                onClick={() => setRoleFilter(r)}>
                {r === 'all' ? 'Todos' : r}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(u => (
              <div key={u.id} className={styles.restoreBanner}>
                <span className={styles.restoreBannerText}>
                  {u.email}
                  {u.role === 'alumno' && role === 'admin' && (
                    <span className={styles.usersMeta}> · profe: {u.teacherId ? (emailById[u.teacherId] ?? '—') : '—'}</span>
                  )}
                </span>
                <span className={`${styles.chip} ${styles.chipSrt}`}>{u.role}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
