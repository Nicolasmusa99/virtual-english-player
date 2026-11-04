// Personas en "Usuarios" (admin) y "Alumnos" (profe): cómo se muestra cada uno. Funciones
// PURAS (sin base: las usa la pantalla): tests/lib/people.test.ts. Los datos de resumen
// (videos, carpetas, próxima clase) los arma lib/people.ts.
import { CLASS_TZ } from '@/lib/classSchedule'
import { hhmm, longDate, relativeDay } from '@/lib/classView'
import type { Role } from '@/lib/db/schema'

// Las iniciales del avatar: "Martina Pérez" → "MP"; "lucia@x.com" → "L".
export function initials(name: string | null | undefined, email?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase()
  if (words.length === 1) return words[0][0].toUpperCase()
  const local = (email ?? '').trim()
  return local ? local[0].toUpperCase() : '?'
}

// Color del avatar: fijo por persona (sale del id), uno de AVATAR_COLORS.
export const AVATAR_COLORS = 8
export function avatarColor(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % AVATAR_COLORS
}

// Orden de la lista: profes, alumnos y admins; adentro, por nombre (o mail).
const ROLE_ORDER: Record<Role, number> = { profesor: 0, alumno: 1, admin: 2 }
export function sortPeople<T extends { name: string | null; email: string | null; role: Role | null }>(list: T[]): T[] {
  const key = (u: T) => (u.name || u.email || '').toLocaleLowerCase('es')
  return [...list].sort((a, b) =>
    (ROLE_ORDER[a.role ?? 'alumno'] - ROLE_ORDER[b.role ?? 'alumno']) || key(a).localeCompare(key(b), 'es'))
}

// '1 video' / '3 videos' / 'Sin material'
export const videosLabel = (n: number) => (n === 0 ? 'Sin material' : n === 1 ? '1 video' : `${n} videos`)
// '1 alumno' / '4 alumnos' / 'Sin alumnos'
export const studentsLabel = (n: number) => (n === 0 ? 'Sin alumnos' : n === 1 ? '1 alumno' : `${n} alumnos`)
// '1 carpeta' / '2 carpetas' / null (sin carpetas no se dice nada)
export const foldersLabel = (n: number) => (n === 0 ? null : n === 1 ? '1 carpeta' : `${n} carpetas`)

// Lo que pasa al borrar una cuenta, para la ventana de confirmación.
export function deleteConsequences(role: Role, studentCount = 0): string[] {
  const always = ['No va a poder volver a entrar.', 'No se puede deshacer.']
  if (role === 'profesor') {
    return [
      'Se borran sus clases y sus subtítulos editados.',
      studentCount > 0
        ? `${studentsLabel(studentCount)} ${studentCount === 1 ? 'queda' : 'quedan'} sin profe (les podés asignar otro).`
        : 'No tiene alumnos.',
      ...always,
    ]
  }
  return ['Se borran su material asignado, sus carpetas y sus clases.', ...always]
}

// 'Hoy, 18:00' / 'Mañana, 18:00' / 'Martes 6 de octubre, 18:00' (hora de Argentina, la del profe).
export function nextClassText(iso: string, now: Date, tz: string = CLASS_TZ): string {
  const t = new Date(iso)
  const rel = relativeDay(t, now, tz)
  const day = rel ?? longDate(t, tz)
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${hhmm(t, tz)}`
}

// La próxima clase de cada alumno: la primera PROGRAMADA que todavía no terminó.
export function nextClassByStudent(
  classes: { studentId: string; startsAt: Date; durationMin: number; status: 'scheduled' | 'cancelled' }[],
  now: Date
): Map<string, Date> {
  const out = new Map<string, Date>()
  for (const c of [...classes].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    if (c.status !== 'scheduled' || c.startsAt.getTime() + c.durationMin * 60_000 <= now.getTime()) continue
    if (!out.has(c.studentId)) out.set(c.studentId, c.startsAt)
  }
  return out
}

