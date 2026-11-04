// @vitest-environment node
// Carpetas (2026-11): /api/folders, /api/folders/[id], /api/folders/[id]/videos y la parte
// de carpetas de /api/assignments (asignar dentro de una carpeta, mover de carpeta).
// Permisos REALES (requireRole, staffAccess); se mockean la sesión y el acceso a datos.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  auth: vi.fn(), getStudentById: vi.fn(),
  getFolder: vi.fn(), listStudentFolders: vi.fn(), listLibraryFolders: vi.fn(), createFolder: vi.fn(), renameFolder: vi.fn(),
  deleteFolder: vi.fn(), moveFolder: vi.fn(), addVideoToFolder: vi.fn(), removeVideoFromFolder: vi.fn(), setAssignmentFolder: vi.fn(),
  listSharedVideoIds: vi.fn(), videoExists: vi.fn(), getAccessibleVideo: vi.fn(),
  assignVideo: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: m.auth }))
vi.mock('@/lib/users', () => ({ getStudentById: m.getStudentById }))
vi.mock('@/lib/folders', async () => ({
  ...(await import('@/lib/folderView')),
  getFolder: m.getFolder, listStudentFolders: m.listStudentFolders, listLibraryFolders: m.listLibraryFolders,
  createFolder: m.createFolder, renameFolder: m.renameFolder, deleteFolder: m.deleteFolder, moveFolder: m.moveFolder,
  addVideoToFolder: m.addVideoToFolder, removeVideoFromFolder: m.removeVideoFromFolder, setAssignmentFolder: m.setAssignmentFolder,
}))
vi.mock('@/lib/library', () => ({ listSharedVideoIds: m.listSharedVideoIds, videoExists: m.videoExists, getAccessibleVideo: m.getAccessibleVideo }))
vi.mock('@/lib/assignments', () => ({
  assignVideo: m.assignVideo, unassignVideo: vi.fn(), listAssignmentsForStudent: vi.fn(), listAssignmentsForTeacher: vi.fn(), listAllAssignments: vi.fn(),
}))

import { GET as LIST, POST as CREATE } from '@/app/api/folders/route'
import { PATCH as EDIT, DELETE as REMOVE } from '@/app/api/folders/[id]/route'
import { POST as ADD_VIDEO, DELETE as TAKE_OUT } from '@/app/api/folders/[id]/videos/route'
import { POST as ASSIGN, PATCH as MOVE } from '@/app/api/assignments/route'

const AD = 'ad-1', PR = 'pr-1', PR2 = 'pr-2'
const AL = '00000000-0000-4000-8000-0000000000c1' // alumno de PR
const AL2 = '00000000-0000-4000-8000-0000000000c2' // alumno de PR2
const F_AL = '00000000-0000-4000-8000-0000000000f1' // carpeta de AL
const F_AL2 = '00000000-0000-4000-8000-0000000000f2' // carpeta de AL2
const F_LIB = '00000000-0000-4000-8000-0000000000f3' // carpeta de la biblioteca
const VID = '00000000-0000-4000-8000-0000000000d1'
const FOLDERS: Record<string, { id: string; name: string; studentId: string | null; position: number }> = {
  [F_AL]: { id: F_AL, name: 'Unidad 1', studentId: AL, position: 0 },
  [F_AL2]: { id: F_AL2, name: 'Otra', studentId: AL2, position: 0 },
  [F_LIB]: { id: F_LIB, name: 'Canciones', studentId: null, position: 0 },
}
const as = (id: string, role: string) => m.auth.mockResolvedValue({ user: { id, role } })
const req = (url: string, method: string, body?: unknown) => new NextRequest('http://localhost' + url, {
  method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
})
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset()
  m.getStudentById.mockImplementation(async (id: string) => ({
    [AL]: { id: AL, role: 'alumno', teacherId: PR }, [AL2]: { id: AL2, role: 'alumno', teacherId: PR2 },
  } as Record<string, unknown>)[id] ?? null)
  m.getFolder.mockImplementation(async (id: string) => FOLDERS[id] ?? null)
  m.createFolder.mockImplementation(async (d: object) => ({ id: 'new', position: 0, ...d }))
  m.listStudentFolders.mockResolvedValue([FOLDERS[F_AL]])
  m.listLibraryFolders.mockResolvedValue([{ ...FOLDERS[F_LIB], videoIds: ['pub', 'priv'] }, { id: 'f-priv', name: 'Privadas', studentId: null, position: 1, videoIds: ['priv'] }])
  m.listSharedVideoIds.mockResolvedValue(['pub'])
  m.videoExists.mockResolvedValue(true)
  m.removeVideoFromFolder.mockResolvedValue(true)
  m.setAssignmentFolder.mockResolvedValue(true)
  m.getAccessibleVideo.mockResolvedValue({ id: VID, publishedAt: new Date() })
  m.assignVideo.mockResolvedValue({ created: true })
})

describe('GET /api/folders', () => {
  it('las de un alumno: su profe y el admin; un profe ajeno no', async () => {
    as(PR, 'profesor')
    expect((await (await LIST(req(`/api/folders?studentId=${AL}`, 'GET'))).json()).folders).toEqual([FOLDERS[F_AL]])
    as(AD, 'admin')
    expect((await LIST(req(`/api/folders?studentId=${AL}`, 'GET'))).status).toBe(200)
    as(PR2, 'profesor')
    expect((await LIST(req(`/api/folders?studentId=${AL}`, 'GET'))).status).toBe(403)
  })
  it('las de la biblioteca: el admin las ve enteras; el profe, solo con lo publicado y sin las vacías', async () => {
    as(AD, 'admin')
    expect((await (await LIST(req('/api/folders', 'GET'))).json()).folders).toHaveLength(2)
    as(PR, 'profesor')
    expect((await (await LIST(req('/api/folders', 'GET'))).json()).folders).toEqual([{ ...FOLDERS[F_LIB], videoIds: ['pub'] }])
  })
  it('el alumno no entra', async () => {
    as(AL, 'alumno')
    expect((await LIST(req('/api/folders', 'GET'))).status).toBe(403)
  })
})

describe('POST /api/folders', () => {
  it('el profe crea una carpeta para SU alumno (nombre limpio)', async () => {
    as(PR, 'profesor')
    const res = await CREATE(req('/api/folders', 'POST', { name: '  Unidad   2 ', studentId: AL }))
    expect(res.status).toBe(201)
    expect(m.createFolder).toHaveBeenCalledWith({ ownerId: PR, studentId: AL, name: 'Unidad 2' })
  })
  it('para un alumno ajeno no; de la biblioteca, solo el admin', async () => {
    as(PR, 'profesor')
    expect((await CREATE(req('/api/folders', 'POST', { name: 'X', studentId: AL2 }))).status).toBe(403)
    expect((await CREATE(req('/api/folders', 'POST', { name: 'X' }))).status).toBe(403)
    as(AD, 'admin')
    expect((await CREATE(req('/api/folders', 'POST', { name: 'Canciones' }))).status).toBe(201)
    expect(m.createFolder).toHaveBeenCalledTimes(1)
    expect(m.createFolder).toHaveBeenCalledWith({ ownerId: AD, studentId: null, name: 'Canciones' })
  })
  it('sin nombre o muy largo → 400', async () => {
    as(AD, 'admin')
    for (const name of ['', '   ', 'x'.repeat(61), 3]) expect((await CREATE(req('/api/folders', 'POST', { name }))).status).toBe(400)
    expect(m.createFolder).not.toHaveBeenCalled()
  })
})

describe('PATCH / DELETE /api/folders/[id]', () => {
  it('renombrar y mover la de su alumno', async () => {
    as(PR, 'profesor')
    expect((await EDIT(req(`/api/folders/${F_AL}`, 'PATCH', { name: 'Unidad uno' }), ctx(F_AL))).status).toBe(200)
    expect(m.renameFolder).toHaveBeenCalledWith(F_AL, 'Unidad uno')
    expect((await EDIT(req(`/api/folders/${F_AL}`, 'PATCH', { move: 'down' }), ctx(F_AL))).status).toBe(200)
    expect(m.moveFolder).toHaveBeenCalledWith(FOLDERS[F_AL], 1)
  })
  it('ajena, de la biblioteca (para un profe) o inexistente → el MISMO 404', async () => {
    as(PR, 'profesor')
    for (const id of [F_AL2, F_LIB, '00000000-0000-4000-8000-000000000999', 'nada']) {
      const res = await EDIT(req(`/api/folders/${id}`, 'PATCH', { name: 'X' }), ctx(id))
      expect(res.status).toBe(404)
      expect((await REMOVE(req(`/api/folders/${id}`, 'DELETE'), ctx(id))).status).toBe(404)
    }
    expect(m.renameFolder).not.toHaveBeenCalled()
    expect(m.deleteFolder).not.toHaveBeenCalled()
  })
  it('datos inválidos → 400', async () => {
    as(AD, 'admin')
    for (const b of [{}, { name: '' }, { move: 'izquierda' }]) expect((await EDIT(req(`/api/folders/${F_LIB}`, 'PATCH', b), ctx(F_LIB))).status).toBe(400)
  })
  it('el admin borra la de la biblioteca', async () => {
    as(AD, 'admin')
    expect((await REMOVE(req(`/api/folders/${F_LIB}`, 'DELETE'), ctx(F_LIB))).status).toBe(200)
    expect(m.deleteFolder).toHaveBeenCalledWith(F_LIB)
  })
})

describe('/api/folders/[id]/videos (biblioteca, solo admin)', () => {
  it('meter y sacar un video', async () => {
    as(AD, 'admin')
    expect((await ADD_VIDEO(req(`/api/folders/${F_LIB}/videos`, 'POST', { videoId: VID }), ctx(F_LIB))).status).toBe(200)
    expect(m.addVideoToFolder).toHaveBeenCalledWith(F_LIB, VID)
    expect((await TAKE_OUT(req(`/api/folders/${F_LIB}/videos`, 'DELETE', { videoId: VID }), ctx(F_LIB))).status).toBe(200)
  })
  it('un profe no; una carpeta de alumno no se llena así; un video inexistente → 404', async () => {
    as(PR, 'profesor')
    expect((await ADD_VIDEO(req(`/api/folders/${F_LIB}/videos`, 'POST', { videoId: VID }), ctx(F_LIB))).status).toBe(403)
    as(AD, 'admin')
    expect((await ADD_VIDEO(req(`/api/folders/${F_AL}/videos`, 'POST', { videoId: VID }), ctx(F_AL))).status).toBe(400)
    m.videoExists.mockResolvedValue(false)
    expect((await ADD_VIDEO(req(`/api/folders/${F_LIB}/videos`, 'POST', { videoId: VID }), ctx(F_LIB))).status).toBe(404)
    expect(m.addVideoToFolder).not.toHaveBeenCalled()
  })
})

describe('/api/assignments con carpetas', () => {
  it('asignar directo dentro de una carpeta del alumno', async () => {
    as(PR, 'profesor')
    expect((await ASSIGN(req('/api/assignments', 'POST', { studentId: AL, videoId: VID, folderId: F_AL }))).status).toBe(201)
    expect(m.assignVideo).toHaveBeenCalledWith({ studentId: AL, videoId: VID, assignedBy: PR, folderId: F_AL })
  })
  it('sin folderId, como siempre (sin tocar la carpeta)', async () => {
    as(PR, 'profesor')
    await ASSIGN(req('/api/assignments', 'POST', { studentId: AL, videoId: VID }))
    expect(m.assignVideo).toHaveBeenCalledWith({ studentId: AL, videoId: VID, assignedBy: PR })
  })
  it('una carpeta de OTRO alumno o de la biblioteca → 400 (no se mezcla material)', async () => {
    as(AD, 'admin')
    for (const folderId of [F_AL2, F_LIB, 'nada']) {
      expect((await ASSIGN(req('/api/assignments', 'POST', { studentId: AL, videoId: VID, folderId }))).status).toBe(400)
      expect((await MOVE(req('/api/assignments', 'PATCH', { studentId: AL, videoId: VID, folderId }))).status).toBe(400)
    }
    expect(m.assignVideo).not.toHaveBeenCalled()
    expect(m.setAssignmentFolder).not.toHaveBeenCalled()
  })
  it('mover de carpeta, y sacarlo de toda carpeta (null)', async () => {
    as(PR, 'profesor')
    expect((await MOVE(req('/api/assignments', 'PATCH', { studentId: AL, videoId: VID, folderId: F_AL }))).status).toBe(200)
    expect((await MOVE(req('/api/assignments', 'PATCH', { studentId: AL, videoId: VID, folderId: null }))).status).toBe(200)
    expect(m.setAssignmentFolder.mock.calls).toEqual([[AL, VID, F_AL], [AL, VID, null]])
  })
  it('mover: alumno ajeno → 403; sin folderId → 400; asignación inexistente → 404', async () => {
    as(PR, 'profesor')
    expect((await MOVE(req('/api/assignments', 'PATCH', { studentId: AL2, videoId: VID, folderId: null }))).status).toBe(403)
    expect((await MOVE(req('/api/assignments', 'PATCH', { studentId: AL, videoId: VID }))).status).toBe(400)
    m.setAssignmentFolder.mockResolvedValue(false)
    expect((await MOVE(req('/api/assignments', 'PATCH', { studentId: AL, videoId: VID, folderId: null }))).status).toBe(404)
  })
})
