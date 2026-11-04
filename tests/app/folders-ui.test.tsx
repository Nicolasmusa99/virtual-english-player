// @vitest-environment jsdom
// Carpetas (2026-11) en pantalla: el material de un alumno (StudentView, lado profe/admin),
// lo que ve el alumno (StudentApp) y las carpetas de la biblioteca del admin.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import StudentView, { MATERIAL_TEXTS as M } from '@/app/StudentView'
import StudentApp, { STUDENT_TEXTS } from '@/app/StudentApp'
import LibraryFolders, { LIB_FOLDER_TEXTS as L } from '@/app/LibraryFolders'
import { FOLDER_TEXTS as F } from '@/app/FolderBox'

const ST = 'st-1'
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
let fetchMock: ReturnType<typeof vi.fn>
const calls = (method: string, url?: string) => fetchMock.mock.calls
  .filter(([u, i]) => (i?.method ?? 'GET') === method && (!url || String(u) === url))
  .map(([u, i]) => ({ url: String(u), body: i?.body ? JSON.parse(String(i.body)) : undefined }))
afterEach(() => vi.unstubAllGlobals())

describe('StudentView — el material de un alumno en carpetas', () => {
  let folders: { id: string; name: string }[]
  let assignments: { videoId: string; originalName: string; sharedType: null; sharedLevel: null; active: boolean; folderId: string | null }[]
  beforeEach(() => {
    folders = [{ id: 'f1', name: 'Unidad 1' }, { id: 'f2', name: 'Canciones' }]
    assignments = [
      { videoId: 'v1', originalName: 'Comercial del auto', sharedType: null, sharedLevel: null, active: true, folderId: 'f1' },
      { videoId: 'v2', originalName: 'Let It Be', sharedType: null, sharedLevel: null, active: true, folderId: null },
    ]
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET'
      if (m !== 'GET') return Promise.resolve(json(200, { ok: true }))
      if (url.startsWith('/api/assignments')) return Promise.resolve(json(200, { assignments }))
      if (url.startsWith('/api/folders')) return Promise.resolve(json(200, { folders }))
      if (url === '/api/shared-videos') return Promise.resolve(json(200, { videos: [{ id: 'v3', originalName: 'Frozen', sharedType: null, sharedLevel: null }] }))
      return Promise.resolve(json(200, { classes: [], series: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  const mount = async () => { render(<StudentView studentId={ST} onOpenVideo={() => {}} />); await flush() }

  it('cada carpeta con sus videos, en orden, y "Sin carpeta" al final', async () => {
    await mount()
    const boxes = screen.getAllByTestId('folder')
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(['Unidad 1', 'Canciones', 'Sin carpeta'])
    expect(boxes[0]).toHaveTextContent('Comercial del auto')
    expect(boxes[1]).toHaveTextContent('Esta carpeta está vacía')
    expect(boxes[2]).toHaveTextContent('Let It Be')
  })

  it('crear una carpeta', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: M.newFolder }))
    fireEvent.change(screen.getByLabelText(M.folderName), { target: { value: ' Unidad 2 ' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: M.create })) })
    expect(calls('POST', '/api/folders')[0].body).toEqual({ name: 'Unidad 2', studentId: ST })
  })

  it('mover un video a otra carpeta (o sacarlo de toda carpeta)', async () => {
    await mount()
    fireEvent.change(screen.getByLabelText(`${M.moveTo}: Let It Be`), { target: { value: 'f2' } })
    await flush()
    expect(calls('PATCH', '/api/assignments')[0].body).toEqual({ studentId: ST, videoId: 'v2', folderId: 'f2' })
    fireEvent.change(screen.getByLabelText(`${M.moveTo}: Comercial del auto`), { target: { value: '' } })
    await flush()
    expect(calls('PATCH', '/api/assignments')[1].body).toEqual({ studentId: ST, videoId: 'v1', folderId: null })
  })

  it('renombrar, subir/bajar y eliminar (con confirmación) una carpeta', async () => {
    await mount()
    const unidad = screen.getAllByTestId('folder')[0]
    expect(within(unidad).getByRole('button', { name: `${F.up} Unidad 1` })).toBeDisabled()
    fireEvent.click(within(unidad).getByRole('button', { name: `${F.down} Unidad 1` }))
    await flush()
    expect(calls('PATCH', '/api/folders/f1')[0].body).toEqual({ move: 'down' })
    fireEvent.click(within(unidad).getByRole('button', { name: F.rename }))
    fireEvent.change(within(unidad).getByLabelText('Nombre de la carpeta'), { target: { value: 'Unidad uno' } })
    await act(async () => { fireEvent.keyDown(within(unidad).getByLabelText('Nombre de la carpeta'), { key: 'Enter' }) })
    expect(calls('PATCH', '/api/folders/f1')[1].body).toEqual({ name: 'Unidad uno' })
    fireEvent.click(within(unidad).getByRole('button', { name: `${F.remove} la carpeta Unidad 1` }))
    const dlg = screen.getByRole('dialog', { name: F.removeTitle('Unidad 1') })
    expect(dlg).toHaveTextContent(M.removeNote)
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: F.removeConfirm })) })
    expect(calls('DELETE', '/api/folders/f1')).toHaveLength(1)
  })

  it('asignar material directo en una carpeta', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: M.assign }))
    await flush()
    fireEvent.change(screen.getByLabelText(M.assignIn), { target: { value: 'f2' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Asignar' })) })
    expect(calls('POST', '/api/assignments')[0].body).toEqual({ studentId: ST, videoId: 'v3', folderId: 'f2' })
  })
})

describe('StudentApp — el alumno ve su material por carpetas', () => {
  const today = new Date().toISOString()
  const mat = (videoId: string, originalName: string, folderId: string | null) =>
    ({ videoId, originalName, sharedType: null, sharedLevel: null, durationSec: null, assignedAt: today, folderId })
  const mountWith = async (material: unknown[], folders: unknown[]) => {
    fetchMock = vi.fn((url: string) => Promise.resolve(url === '/api/student/material'
      ? json(200, { material, folders })
      : json(200, { classes: [], teacherName: null })))
    vi.stubGlobal('fetch', fetchMock)
    render(<StudentApp name="Martina" email={null} />)
    await flush()
  }

  it('un grupo por carpeta (sin las vacías) y "Otros videos" al final', async () => {
    await mountWith(
      [mat('v1', 'Comercial', 'f1'), mat('v2', 'Let It Be', null), mat('v3', 'Frozen', 'f2')],
      [{ id: 'f2', name: 'Canciones' }, { id: 'f1', name: 'Unidad 1' }, { id: 'f9', name: 'Vacía' }],
    )
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles).toEqual(['Canciones1 video', 'Unidad 11 video', `${STUDENT_TEXTS.otherVideos}1 video`])
  })

  it('sin carpetas, como siempre (sin títulos de grupo)', async () => {
    await mountWith([mat('v1', 'Comercial', null)], [])
    expect(screen.queryAllByRole('heading', { level: 3 })).toEqual([])
    expect(screen.getByRole('button', { name: /Comercial/ })).toBeInTheDocument()
  })
})

describe('LibraryFolders — las carpetas de la biblioteca (admin)', () => {
  const VIDEOS = [
    { id: 'v1', originalName: 'Comercial', status: 'ready', phraseCount: 6, sharedType: null, sharedLevel: null, publishedAt: '2026-10-01' },
    { id: 'v2', originalName: 'Ensayo', status: 'ready', phraseCount: 3, sharedType: null, sharedLevel: null, publishedAt: null },
  ]
  beforeEach(() => {
    fetchMock = vi.fn((_url: string, init?: RequestInit) => Promise.resolve((init?.method ?? 'GET') === 'GET'
      ? json(200, { folders: [{ id: 'lf1', name: 'Canciones', videoIds: ['v1'] }] })
      : json(200, { ok: true })))
    vi.stubGlobal('fetch', fetchMock)
  })

  it('muestra sus videos, agrega uno, saca otro y crea carpetas', async () => {
    render(<LibraryFolders videos={VIDEOS} onOpen={() => {}} />)
    await flush()
    const box = screen.getByTestId('folder')
    expect(box).toHaveTextContent('Comercial')
    fireEvent.change(within(box).getByLabelText(`${L.addVideo} a Canciones`), { target: { value: 'v2' } })
    await flush()
    expect(calls('POST', '/api/folders/lf1/videos')[0].body).toEqual({ videoId: 'v2' })
    expect(within(box).getByText(L.unpublished)).toBeInTheDocument() // Ensayo es privado
    fireEvent.click(within(box).getByRole('button', { name: `${L.takeOut} Comercial de Canciones` }))
    await flush()
    expect(calls('DELETE', '/api/folders/lf1/videos')[0].body).toEqual({ videoId: 'v1' })
    fireEvent.click(screen.getByRole('button', { name: L.newFolder }))
    fireEvent.change(screen.getByLabelText(L.folderName), { target: { value: 'Películas' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: L.create })) })
    expect(calls('POST', '/api/folders')[0].body).toEqual({ name: 'Películas' })
  })
})
