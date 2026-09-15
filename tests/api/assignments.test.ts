// @vitest-environment node
// Fase asignar-material — rutas /api/assignments. La lógica de permisos (requireRole,
// checkStudent) corre REAL; se mockean solo la sesión (@/lib/auth) y el acceso a datos
// (@/lib/users, @/lib/library, @/lib/assignments). El cascade se verifica a nivel schema
// con getTableConfig (sin DB → CI-safe).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { getTableConfig } from 'drizzle-orm/pg-core'

const {
  authMock,
  getStudentByIdMock,
  getAccessibleVideoMock,
  assignVideoMock,
  unassignVideoMock,
  listForStudentMock,
  listForTeacherMock,
  listAllMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getStudentByIdMock: vi.fn(),
  getAccessibleVideoMock: vi.fn(),
  assignVideoMock: vi.fn(),
  unassignVideoMock: vi.fn(),
  listForStudentMock: vi.fn(),
  listForTeacherMock: vi.fn(),
  listAllMock: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/users', () => ({ getStudentById: getStudentByIdMock }))
vi.mock('@/lib/library', () => ({ getAccessibleVideo: getAccessibleVideoMock }))
vi.mock('@/lib/assignments', () => ({
  assignVideo: assignVideoMock,
  unassignVideo: unassignVideoMock,
  listAssignmentsForStudent: listForStudentMock,
  listAssignmentsForTeacher: listForTeacherMock,
  listAllAssignments: listAllMock,
}))

import { GET, POST, DELETE } from '@/app/api/assignments/route'
import { assignments } from '@/lib/db/schema'

const bodyReq = (method: string, body: unknown) =>
  new NextRequest('http://localhost/api/assignments', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const getReq = (qs = '') => new NextRequest(`http://localhost/api/assignments${qs}`)

const PUBLISHED = { id: 'vid-1', publishedAt: new Date(), userId: 'ad-1' }
const UNPUBLISHED = { id: 'vid-2', publishedAt: null, userId: 'ad-1' }

beforeEach(() => {
  authMock.mockReset()
  getStudentByIdMock.mockReset()
  getAccessibleVideoMock.mockReset()
  assignVideoMock.mockReset().mockResolvedValue({ created: true })
  unassignVideoMock.mockReset().mockResolvedValue({ removed: true })
  listForStudentMock.mockReset().mockResolvedValue([])
  listForTeacherMock.mockReset().mockResolvedValue([])
  listAllMock.mockReset().mockResolvedValue([])
})

// Helpers de sesión
const asAlumno = () => authMock.mockResolvedValue({ user: { id: 'al-x', role: 'alumno' } })
const asProfe = (id = 'prof-1') => authMock.mockResolvedValue({ user: { id, role: 'profesor' } })
const asAdmin = () => authMock.mockResolvedValue({ user: { id: 'ad-1', role: 'admin' } })
// alumno de prof-1
const ownStudent = () => getStudentByIdMock.mockResolvedValue({ id: 'al-1', role: 'alumno', teacherId: 'prof-1' })

describe('POST /api/assignments — asignar', () => {
  it('401 sin sesión', async () => {
    authMock.mockResolvedValue(null)
    const res = await POST(bodyReq('POST', { studentId: 'al-1', videoId: 'vid-1' }))
    expect(res.status).toBe(401)
    expect(assignVideoMock).not.toHaveBeenCalled()
  })

  it('403 alumno', async () => {
    asAlumno()
    const res = await POST(bodyReq('POST', { studentId: 'al-1', videoId: 'vid-1' }))
    expect(res.status).toBe(403)
    expect(assignVideoMock).not.toHaveBeenCalled()
  })

  it('profe asigna a SU alumno un video publicado → 201', async () => {
    asProfe()
    ownStudent()
    getAccessibleVideoMock.mockResolvedValue(PUBLISHED)
    const res = await POST(bodyReq('POST', { studentId: 'al-1', videoId: 'vid-1' }))
    expect(res.status).toBe(201)
    expect(assignVideoMock).toHaveBeenCalledWith({ studentId: 'al-1', videoId: 'vid-1', assignedBy: 'prof-1' })
  })

  it('INVARIANTE: profe NO puede asignar a un alumno AJENO → 403', async () => {
    asProfe('prof-1')
    getStudentByIdMock.mockResolvedValue({ id: 'al-9', role: 'alumno', teacherId: 'prof-OTRO' })
    const res = await POST(bodyReq('POST', { studentId: 'al-9', videoId: 'vid-1' }))
    expect(res.status).toBe(403)
    expect(getAccessibleVideoMock).not.toHaveBeenCalled()
    expect(assignVideoMock).not.toHaveBeenCalled()
  })

  it('studentId inexistente → 404', async () => {
    asProfe()
    getStudentByIdMock.mockResolvedValue(null)
    const res = await POST(bodyReq('POST', { studentId: 'ghost', videoId: 'vid-1' }))
    expect(res.status).toBe(404)
    expect(assignVideoMock).not.toHaveBeenCalled()
  })

  it('studentId que no es alumno (un profe) → 404', async () => {
    asAdmin()
    getStudentByIdMock.mockResolvedValue({ id: 'prof-2', role: 'profesor', teacherId: null })
    const res = await POST(bodyReq('POST', { studentId: 'prof-2', videoId: 'vid-1' }))
    expect(res.status).toBe(404)
    expect(assignVideoMock).not.toHaveBeenCalled()
  })

  it('INVARIANTE: NO se puede asignar un video despublicado → 400', async () => {
    asProfe()
    ownStudent()
    getAccessibleVideoMock.mockResolvedValue(UNPUBLISHED)
    const res = await POST(bodyReq('POST', { studentId: 'al-1', videoId: 'vid-2' }))
    expect(res.status).toBe(400)
    expect(assignVideoMock).not.toHaveBeenCalled()
  })

  it('video inexistente/no accesible → 404', async () => {
    asProfe()
    ownStudent()
    getAccessibleVideoMock.mockResolvedValue(null)
    const res = await POST(bodyReq('POST', { studentId: 'al-1', videoId: 'nope' }))
    expect(res.status).toBe(404)
    expect(assignVideoMock).not.toHaveBeenCalled()
  })

  it('admin asigna a cualquier alumno un video publicado → 201', async () => {
    asAdmin()
    getStudentByIdMock.mockResolvedValue({ id: 'al-7', role: 'alumno', teacherId: 'prof-9' })
    getAccessibleVideoMock.mockResolvedValue(PUBLISHED)
    const res = await POST(bodyReq('POST', { studentId: 'al-7', videoId: 'vid-1' }))
    expect(res.status).toBe(201)
    expect(assignVideoMock).toHaveBeenCalledWith({ studentId: 'al-7', videoId: 'vid-1', assignedBy: 'ad-1' })
  })

  it('idempotente: si ya existía → 200 (created:false)', async () => {
    asProfe()
    ownStudent()
    getAccessibleVideoMock.mockResolvedValue(PUBLISHED)
    assignVideoMock.mockResolvedValue({ created: false })
    const res = await POST(bodyReq('POST', { studentId: 'al-1', videoId: 'vid-1' }))
    expect(res.status).toBe(200)
    expect((await res.json()).created).toBe(false)
  })

  it('mass-assignment cerrado: solo se leen studentId y videoId', async () => {
    asProfe()
    ownStudent()
    getAccessibleVideoMock.mockResolvedValue(PUBLISHED)
    await POST(bodyReq('POST', { studentId: 'al-1', videoId: 'vid-1', assignedBy: 'evil', assignedAt: 'x' }))
    expect(assignVideoMock).toHaveBeenCalledWith({ studentId: 'al-1', videoId: 'vid-1', assignedBy: 'prof-1' })
  })

  it('body inválido → 400', async () => {
    asProfe()
    const res = await POST(bodyReq('POST', 'no-soy-objeto'))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/assignments — desasignar', () => {
  it('403 alumno', async () => {
    asAlumno()
    const res = await DELETE(bodyReq('DELETE', { studentId: 'al-1', videoId: 'vid-1' }))
    expect(res.status).toBe(403)
    expect(unassignVideoMock).not.toHaveBeenCalled()
  })

  it('profe desasigna a su alumno → 200', async () => {
    asProfe()
    ownStudent()
    const res = await DELETE(bodyReq('DELETE', { studentId: 'al-1', videoId: 'vid-1' }))
    expect(res.status).toBe(200)
    expect(unassignVideoMock).toHaveBeenCalledWith('al-1', 'vid-1')
  })

  it('INVARIANTE: profe NO puede desasignar a un alumno AJENO → 403', async () => {
    asProfe('prof-1')
    getStudentByIdMock.mockResolvedValue({ id: 'al-9', role: 'alumno', teacherId: 'prof-OTRO' })
    const res = await DELETE(bodyReq('DELETE', { studentId: 'al-9', videoId: 'vid-1' }))
    expect(res.status).toBe(403)
    expect(unassignVideoMock).not.toHaveBeenCalled()
  })

  it('desasignar algo inexistente → 404', async () => {
    asProfe()
    ownStudent()
    unassignVideoMock.mockResolvedValue({ removed: false })
    const res = await DELETE(bodyReq('DELETE', { studentId: 'al-1', videoId: 'vid-1' }))
    expect(res.status).toBe(404)
  })
})

describe('GET /api/assignments — listar (scopeado)', () => {
  it('401 sin sesión', async () => {
    authMock.mockResolvedValue(null)
    expect((await GET(getReq())).status).toBe(401)
  })

  it('403 alumno', async () => {
    asAlumno()
    const res = await GET(getReq())
    expect(res.status).toBe(403)
    expect(listForTeacherMock).not.toHaveBeenCalled()
    expect(listAllMock).not.toHaveBeenCalled()
  })

  it('INVARIANTE: profe sin studentId → SOLO sus alumnos (listForTeacher con su id), nunca todas', async () => {
    asProfe('prof-1')
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    expect(listForTeacherMock).toHaveBeenCalledWith('prof-1')
    expect(listAllMock).not.toHaveBeenCalled()
  })

  it('admin sin studentId → todas', async () => {
    asAdmin()
    const res = await GET(getReq())
    expect(res.status).toBe(200)
    expect(listAllMock).toHaveBeenCalled()
    expect(listForTeacherMock).not.toHaveBeenCalled()
  })

  it('profe ?studentId=suyo → listForStudent', async () => {
    asProfe()
    ownStudent()
    const res = await GET(getReq('?studentId=al-1'))
    expect(res.status).toBe(200)
    expect(listForStudentMock).toHaveBeenCalledWith('al-1')
  })

  it('INVARIANTE: profe ?studentId=AJENO → 403, no lista', async () => {
    asProfe('prof-1')
    getStudentByIdMock.mockResolvedValue({ id: 'al-9', role: 'alumno', teacherId: 'prof-OTRO' })
    const res = await GET(getReq('?studentId=al-9'))
    expect(res.status).toBe(403)
    expect(listForStudentMock).not.toHaveBeenCalled()
  })
})

describe('INVARIANTE cascade/set-null — FKs de assignments (nivel schema)', () => {
  const { foreignKeys } = getTableConfig(assignments)
  const onDeleteOf = (col: string) =>
    foreignKeys.find((fk) => fk.reference().columns.some((c) => c.name === col))?.onDelete

  it('student_id → user ON DELETE CASCADE (borrar alumno → sus asignaciones se van)', () => {
    expect(onDeleteOf('student_id')).toBe('cascade')
  })
  it('video_id → videos ON DELETE CASCADE (borrar video → sus asignaciones se van)', () => {
    expect(onDeleteOf('video_id')).toBe('cascade')
  })
  it('assigned_by → user ON DELETE SET NULL (auditoría; no arrastra la asignación)', () => {
    expect(onDeleteOf('assigned_by')).toBe('set null')
  })
})
