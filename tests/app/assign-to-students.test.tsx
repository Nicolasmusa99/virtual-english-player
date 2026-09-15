// @vitest-environment jsdom
// Fase asignar-material — AssignToStudents (video-centric). fetch mockeado; se ejercita
// el cruce alumnos×asignaciones, el toggle asignar/quitar, el estado vacío y Escape.
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AssignToStudents from '@/app/AssignToStudents'

const USERS = {
  users: [
    { id: 'al-1', email: 'a@x.com', role: 'alumno' },
    { id: 'al-2', email: 'b@x.com', role: 'alumno' },
    { id: 'prof-1', email: 'p@x.com', role: 'profesor' }, // debe filtrarse
  ],
}
// al-1 ya tiene v1; al-2 tiene otro video (no v1)
const ASSIGN = { assignments: [{ studentId: 'al-1', videoId: 'v1' }, { studentId: 'al-2', videoId: 'otro' }] }

let fetchMock: ReturnType<typeof vi.fn>
function setup(routes: (url: string, init?: RequestInit) => unknown) {
  fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify(routes(String(url), init) ?? {}), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })))
  vi.stubGlobal('fetch', fetchMock)
}
const routes = (url: string) => {
  if (url === '/api/users') return USERS
  if (url === '/api/assignments') return ASSIGN
  return {}
}
const bodyOf = (method: string) => {
  const call = fetchMock.mock.calls.find((c) => c[0] === '/api/assignments' && (c[1] as RequestInit | undefined)?.method === method)
  return call ? JSON.parse((call[1] as RequestInit).body as string) : null
}

beforeEach(() => { vi.restoreAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

describe('AssignToStudents', () => {
  it('muestra solo alumnos; tildado según ya asignados a ESTE video', async () => {
    setup(routes)
    render(<AssignToStudents videoId="v1" videoName="Matilda" onClose={() => {}} />)
    await screen.findByText('a@x.com')
    expect(screen.getByText('b@x.com')).toBeInTheDocument()
    expect(screen.queryByText('p@x.com')).toBeNull() // profesor filtrado
    expect(screen.getByText('✓ Asignado — quitar')).toBeInTheDocument() // al-1 ya tiene v1
    expect(screen.getByText('Asignar')).toBeInTheDocument() // al-2 no
  })

  it('asignar a un alumno nuevo → POST {studentId, videoId}', async () => {
    setup(routes)
    render(<AssignToStudents videoId="v1" videoName="Matilda" onClose={() => {}} />)
    await screen.findByText('b@x.com')
    fireEvent.click(screen.getByText('Asignar')) // al-2
    await waitFor(() => expect(bodyOf('POST')).toEqual({ studentId: 'al-2', videoId: 'v1' }))
  })

  it('quitar a un alumno ya asignado → DELETE', async () => {
    setup(routes)
    render(<AssignToStudents videoId="v1" videoName="Matilda" onClose={() => {}} />)
    await screen.findByText('a@x.com')
    fireEvent.click(screen.getByText('✓ Asignado — quitar')) // al-1
    await waitFor(() => expect(bodyOf('DELETE')).toEqual({ studentId: 'al-1', videoId: 'v1' }))
  })

  it('estado vacío cuando no hay alumnos', async () => {
    setup((url) => (url === '/api/users' ? { users: [] } : url === '/api/assignments' ? { assignments: [] } : {}))
    render(<AssignToStudents videoId="v1" videoName="Matilda" onClose={() => {}} />)
    expect(await screen.findByText(/No tenés alumnos todavía/)).toBeInTheDocument()
  })

  it('Escape cierra (onClose)', async () => {
    setup(routes)
    const onClose = vi.fn()
    render(<AssignToStudents videoId="v1" videoName="Matilda" onClose={onClose} />)
    await screen.findByText('a@x.com')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
