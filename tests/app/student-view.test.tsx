// @vitest-environment jsdom
// Fase asignar-material — StudentView (student-centric). fetch mockeado; se ejercita
// la UI real: lista asignada, ítem atenuado "no disponible", picker asignar/quitar,
// estado vacío. La seguridad vive en el backend (ya testeada en tests/api/assignments).
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import StudentView from '@/app/StudentView'

const ASSIGNED = {
  assignments: [
    { videoId: 'v1', originalName: 'Matilda.mp4', sharedType: 'pelicula', sharedLevel: 'beginner', active: true },
    { videoId: 'v2', originalName: 'Old Song.mp4', sharedType: 'cancion', sharedLevel: 'medium', active: false },
  ],
}
const SHARED = {
  videos: [
    { id: 'v1', originalName: 'Matilda.mp4', sharedType: 'pelicula', sharedLevel: 'beginner' },
    { id: 'v3', originalName: 'New Movie.mp4', sharedType: 'pelicula', sharedLevel: 'advance' },
  ],
}

let fetchMock: ReturnType<typeof vi.fn>
function setup(routes: (url: string, init?: RequestInit) => unknown) {
  fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify(routes(String(url), init) ?? {}), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })))
  vi.stubGlobal('fetch', fetchMock)
}
const defaultRoutes = (url: string) => {
  if (url.startsWith('/api/assignments?')) return ASSIGNED
  if (url === '/api/shared-videos') return SHARED
  return {}
}
const bodyOf = (method: string) => {
  const call = fetchMock.mock.calls.find((c) => c[0] === '/api/assignments' && (c[1] as RequestInit | undefined)?.method === method)
  return call ? JSON.parse((call[1] as RequestInit).body as string) : null
}

beforeEach(() => { vi.restoreAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

describe('StudentView', () => {
  it('lista lo asignado; ítem despublicado atenuado "no disponible" y "Abrir" deshabilitado', async () => {
    setup(defaultRoutes)
    render(<StudentView studentId="al-1" studentEmail="a@x.com" onOpenVideo={() => {}} />)
    await screen.findByText('Matilda.mp4')
    expect(screen.getByText(/no disponible/)).toBeInTheDocument()
    const abrir = screen.getAllByRole('button', { name: 'Abrir' })
    expect((abrir[0] as HTMLButtonElement).disabled).toBe(false) // v1 activo
    expect((abrir[1] as HTMLButtonElement).disabled).toBe(true)  // v2 despublicado
  })

  it('estado vacío cuando no hay material asignado', async () => {
    setup((url) => (url.startsWith('/api/assignments?') ? { assignments: [] } : {}))
    render(<StudentView studentId="al-1" studentEmail="a@x.com" onOpenVideo={() => {}} />)
    expect(await screen.findByText(/todavía no tiene material asignado/)).toBeInTheDocument()
  })

  it('picker: video ya asignado muestra "✓ Asignado — quitar"; asignar uno nuevo → POST', async () => {
    setup(defaultRoutes)
    render(<StudentView studentId="al-1" studentEmail="a@x.com" onOpenVideo={() => {}} />)
    await screen.findByText('Matilda.mp4')
    fireEvent.click(screen.getByText('+ Asignar material'))
    await screen.findByText('New Movie.mp4')
    expect(screen.getByText('✓ Asignado — quitar')).toBeInTheDocument() // v1 ya asignado
    fireEvent.click(screen.getByText('Asignar')) // v3 (no asignado)
    await waitFor(() => expect(bodyOf('POST')).toEqual({ studentId: 'al-1', videoId: 'v3' }))
  })

  it('quitar un asignado → DELETE con {studentId, videoId}', async () => {
    setup(defaultRoutes)
    render(<StudentView studentId="al-1" studentEmail="a@x.com" onOpenVideo={() => {}} />)
    await screen.findByText('Matilda.mp4')
    fireEvent.click(screen.getAllByText('Quitar')[0]) // v1
    await waitFor(() => expect(bodyOf('DELETE')).toEqual({ studentId: 'al-1', videoId: 'v1' }))
  })
})
