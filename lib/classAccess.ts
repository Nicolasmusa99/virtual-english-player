// Calendario (C1) — QUIÉN puede gestionar las clases de QUIÉN. Funciones puras (sin DB):
// las rutas buscan al alumno / la fila y le preguntan acá. Tests: tests/lib/class-access.test.ts.
//
// Regla (la misma que "asignar material"):
//   · profesor → solo alumnos con teacher_id = él. Las clases quedan a su nombre.
//   · admin    → cualquier alumno, pero la clase queda a nombre del PROFE ACTUAL del
//                alumno (si no tiene profe, no se puede agendar: 400).
//   · alumno   → nunca gestiona (las rutas del profe ya lo frenan con requireRole).
// Una fila (serie/evento) de OTRO profe —o de un profe anterior del alumno— responde
// 404, igual que si no existiera: no se revela que existe.
import type { Role } from '@/lib/db/schema'

export type Me = { id: string; role: Role | null }
export type StudentRef = { id: string; role: Role | null; teacherId: string | null } | null
export type ScopeFail = { ok: false; status: 400 | 403 | 404; error: string }

export const CLASS_ERRORS = {
  studentNotFound: 'Alumno no encontrado',
  notYourStudent: 'Ese alumno no es tuyo',
  noTeacher: 'El alumno no tiene profe asignado',
  classNotFound: 'Clase no encontrada',
  forbidden: 'No autorizado',
  // G1: las clases usan SOLO Zoom (decisión del dueño). Mismo texto que "Mi sala de Zoom".
  zoomOnly: 'Tiene que ser un link de Zoom (https://…zoom.us/…)',
} as const

// ¿`me` puede agendar clases a `student`? → a nombre de qué profe.
export function classScopeFor(me: Me, student: StudentRef): { ok: true; teacherId: string } | ScopeFail {
  if (!student || student.role !== 'alumno') return { ok: false, status: 404, error: CLASS_ERRORS.studentNotFound }
  if (me.role === 'profesor') {
    return student.teacherId === me.id
      ? { ok: true, teacherId: me.id }
      : { ok: false, status: 403, error: CLASS_ERRORS.notYourStudent }
  }
  if (me.role === 'admin') {
    return student.teacherId
      ? { ok: true, teacherId: student.teacherId }
      : { ok: false, status: 400, error: CLASS_ERRORS.noTeacher }
  }
  return { ok: false, status: 403, error: CLASS_ERRORS.forbidden }
}

// ¿`me` puede tocar esta serie/evento? Todo lo que no sea "sí" es el MISMO 404.
export function rowScopeFor(
  me: Me,
  row: { teacherId: string; studentId: string } | null,
  student: StudentRef
): { ok: true; teacherId: string } | ScopeFail {
  const notFound: ScopeFail = { ok: false, status: 404, error: CLASS_ERRORS.classNotFound }
  if (!row || !student || student.id !== row.studentId) return notFound
  const scope = classScopeFor(me, student)
  if (!scope.ok || scope.teacherId !== row.teacherId) return notFound
  return scope
}

// Ids de filas en la URL: un uuid o nada (cualquier otra cosa → el mismo 404).
export const isUuid = (x: unknown): x is string =>
  typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)
