// @vitest-environment node
// Vista del alumno (E1) — rutas /api/student/material y /api/student/material/[videoId].
// La lógica de permisos (requireRole) corre REAL; se mockean la sesión (@/lib/auth) y
// el acceso a datos (@/lib/assignments). La regla de "qué copia de captions" se
// prueba aparte (tests/lib/student-material.test.ts) y en vivo contra la base de pruebas.
//
// Lo central:
//   · solo 'alumno' entra (admin y profe: 403; sin sesión: 401) y la DB ni se toca;
//   · el id del alumno sale de la SESIÓN, nunca del pedido;
//   · "no existe" / "no es tuyo" / "id inválido" → el MISMO 404;
//   · lista blanca de campos en las respuestas.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { authMock, listForStudentMock, getStudentMaterialMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  listForStudentMock: vi.fn(),
  getStudentMaterialMock: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('@/lib/assignments', () => ({
  listAssignmentsForStudent: listForStudentMock,
  getStudentMaterial: getStudentMaterialMock,
}))

import { GET as LIST } from '@/app/api/student/material/route'
import { GET as ONE } from '@/app/api/student/material/[videoId]/route'

const ALUMNO_A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const ALUMNO_B = 'bbbbbbbb-0000-4000-8000-00000000000b'
const VID = '11111111-2222-4333-8444-555555555555'
const OTHER_VID = '99999999-2222-4333-8444-555555555555'

const as = (id: string | null, role: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id, role } } : null)
const one = (videoId: string, qs = '') =>
  ONE(new NextRequest(`http://localhost/api/student/material/${videoId}${qs}`), { params: Promise.resolve({ videoId }) })

beforeEach(() => {
  authMock.mockReset()
  listForStudentMock.mockReset().mockResolvedValue([])
  getStudentMaterialMock.mockReset().mockResolvedValue(null)
})

// ─────────────────────────────────────────────────────────────────────────────
describe('solo el alumno entra (las dos rutas)', () => {
  const cases: Array<[string, string | null, string | null, number]> = [
    ['sin sesión', null, null, 401],
    ['profesor', 'prof-1', 'profesor', 403],
    ['admin', 'ad-1', 'admin', 403],
    ['usuario sin rol', 'x-1', null, 403],
  ]
  for (const [name, id, role, status] of cases) {
    it(`${name} → ${status} y no se consulta la base`, async () => {
      as(id, role)
      expect((await LIST()).status).toBe(status)
      expect((await one(VID)).status).toBe(status)
      expect(listForStudentMock).not.toHaveBeenCalled()
      expect(getStudentMaterialMock).not.toHaveBeenCalled()
    })
  }

  it('alumno → 200 en la lista', async () => {
    as(ALUMNO_A, 'alumno')
    expect((await LIST()).status).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/student/material — su lista', () => {
  const row = (videoId: string, active: boolean) => ({
    videoId,
    originalName: `video-${videoId.slice(0, 4)}.mp4`,
    sharedType: 'pelicula',
    sharedLevel: 'b1',
    durationSec: 120,
    publishedAt: active ? new Date('2026-09-01') : null,
    active,
    assignedAt: new Date('2026-09-20'),
    assignedBy: 'prof-1',
  })

  it('pide la lista del alumno DE LA SESIÓN (A ve lo de A, B ve lo de B)', async () => {
    as(ALUMNO_A, 'alumno')
    await LIST()
    expect(listForStudentMock).toHaveBeenLastCalledWith(ALUMNO_A)
    as(ALUMNO_B, 'alumno')
    await LIST()
    expect(listForStudentMock).toHaveBeenLastCalledWith(ALUMNO_B)
  })

  it('los despublicados NO aparecen', async () => {
    as(ALUMNO_A, 'alumno')
    listForStudentMock.mockResolvedValue([row(VID, true), row(OTHER_VID, false)])
    const { material } = await (await LIST()).json()
    expect(material.map((m: { videoId: string }) => m.videoId)).toEqual([VID])
  })

  it('lista blanca: sin quién asignó ni fecha de publicación', async () => {
    as(ALUMNO_A, 'alumno')
    listForStudentMock.mockResolvedValue([row(VID, true)])
    const { material } = await (await LIST()).json()
    expect(Object.keys(material[0]).sort()).toEqual(
      ['assignedAt', 'durationSec', 'originalName', 'sharedLevel', 'sharedType', 'videoId'].sort()
    )
    expect(JSON.stringify(material)).not.toContain('prof-1')
  })

  it('sin material → lista vacía (no error)', async () => {
    as(ALUMNO_A, 'alumno')
    const res = await LIST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ material: [] })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/student/material/[videoId] — un video', () => {
  const FOUND = {
    videoId: VID,
    originalName: 'escena.mp4',
    storageUrl: 'https://blob.example/escena.mp4',
    durationSec: 95,
    phrases: [{ start: 0, end: 2, text: 'Hello there' }],
    delay: 0.5,
  }

  it('pregunta por (alumno DE LA SESIÓN, video): un parámetro en el pedido no cambia de alumno', async () => {
    as(ALUMNO_A, 'alumno')
    await one(VID, `?studentId=${ALUMNO_B}`)
    expect(getStudentMaterialMock).toHaveBeenCalledWith(ALUMNO_A, VID)
    expect(getStudentMaterialMock).not.toHaveBeenCalledWith(ALUMNO_B, expect.anything())
  })

  it('"no es tuyo" y "no existe" dan EXACTAMENTE la misma respuesta (404)', async () => {
    as(ALUMNO_A, 'alumno')
    getStudentMaterialMock.mockResolvedValue(null) // el de B o uno inexistente: la capa de datos devuelve null
    const r1 = await one(VID)
    const r2 = await one(OTHER_VID)
    expect(r1.status).toBe(404)
    expect(r2.status).toBe(404)
    expect(await r1.json()).toEqual(await r2.json())
  })

  it('id inválido → el mismo 404, sin tocar la base', async () => {
    as(ALUMNO_A, 'alumno')
    for (const bad of ['123', 'no-es-uuid', `${VID}x`, "' OR 1=1 --"]) {
      const res = await one(bad)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'Material no encontrado' })
    }
    expect(getStudentMaterialMock).not.toHaveBeenCalled()
  })

  it('encontrado → 200 con lista blanca: video {id,nombre,url,duración} + captions {frases,delay}', async () => {
    as(ALUMNO_A, 'alumno')
    getStudentMaterialMock.mockResolvedValue(FOUND)
    const res = await one(VID)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      video: { id: VID, originalName: 'escena.mp4', storageUrl: 'https://blob.example/escena.mp4', durationSec: 95 },
      captions: { phrases: [{ start: 0, end: 2, text: 'Hello there' }], delay: 0.5 },
    })
  })

  it('aunque la capa de datos trajera campos de más, la respuesta no los deja salir', async () => {
    as(ALUMNO_A, 'alumno')
    getStudentMaterialMock.mockResolvedValue({ ...FOUND, ownerId: 'ad-1', teacherId: 'prof-1', email: 'x@y.z' })
    const body = await (await one(VID)).json()
    const flat = JSON.stringify(body)
    for (const leak of ['ad-1', 'prof-1', 'x@y.z', 'ownerId', 'teacherId']) expect(flat).not.toContain(leak)
  })
})
