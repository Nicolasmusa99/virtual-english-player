// Quién puede tocar el material (asignaciones y carpetas) de un alumno: el admin, de
// cualquiera; el profe, SOLO de sus alumnos (teacher_id = él, chequeado acá, nunca del
// body). Lo usan /api/assignments y /api/folders.
import type { Role } from '@/lib/db/schema'
import { getStudentById } from '@/lib/users'
import { getFolder, type Folder } from '@/lib/folders'

export type Me = { id: string; role: Role | null }
type Student = NonNullable<Awaited<ReturnType<typeof getStudentById>>>
type Fail = { ok: false; status: 400 | 403 | 404; error: string }

export async function checkStudentFor(studentId: unknown, me: Me): Promise<{ ok: true; student: Student } | Fail> {
  if (typeof studentId !== 'string' || !studentId) return { ok: false, status: 400, error: 'studentId requerido' }
  const student = await getStudentById(studentId)
  if (!student || student.role !== 'alumno') return { ok: false, status: 404, error: 'Alumno no encontrado' }
  if (me.role === 'profesor' && student.teacherId !== me.id) return { ok: false, status: 403, error: 'Ese alumno no es tuyo' }
  return { ok: true, student }
}

export const FOLDER_NOT_FOUND = 'Carpeta no encontrada'

// Una carpeta que `me` puede EDITAR: la de un alumno suyo (o cualquiera, si es admin), o
// una de la biblioteca (solo el admin). Todo lo demás es el MISMO 404.
export async function editableFolder(id: unknown, me: Me): Promise<{ ok: true; folder: Folder } | Fail> {
  const notFound: Fail = { ok: false, status: 404, error: FOLDER_NOT_FOUND }
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return notFound
  const folder = await getFolder(id)
  if (!folder) return notFound
  if (folder.studentId === null) return me.role === 'admin' ? { ok: true, folder } : notFound
  const chk = await checkStudentFor(folder.studentId, me)
  return chk.ok ? { ok: true, folder } : notFound
}
