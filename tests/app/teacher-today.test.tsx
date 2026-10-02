// @vitest-environment jsdom
// Rediseño (fase 2) — "Hoy" del profe (TeacherToday) y "Mi sala de Zoom" en corto.
// Reloj fijo: jueves 1/10/2026 14:40 en Buenos Aires.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import TeacherToday, { TODAY_TEXTS as T } from '@/app/TeacherToday'
import ZoomRoomStatus, { ZOOM_STATUS_TEXTS as Z } from '@/app/ZoomRoomStatus'
import { DIALOG_TEXTS as D } from '@/app/ClassDialog'

const ZOOM = 'https://us02web.zoom.us/j/111'
const STUDENTS = [
  { id: 'st-m', name: 'Martina Pérez', email: 'martina@x.com' },
  { id: 'st-t', name: 'Tomás Ruiz', email: 'tomas@x.com' },
  { id: 'st-l', name: 'Lucía Gómez', email: 'lucia@x.com' },
]
const SER_M = { id: 'ser-m', studentId: 'st-m', weekdays: [2, 4], time: '18:00', durationMin: 60, startsOn: '2026-09-01', endsOn: null, meetUrl: null }
const CLASSES = [
  { key: 'e-t0', studentId: 'st-t', seriesId: null, eventId: 'e-t0', startsAt: '2026-09-28T20:00:00.000Z', durationMin: 60, meetUrl: null, status: 'scheduled', originalStartsAt: null }, // lun 17:00
  { key: 'e-l', studentId: 'st-l', seriesId: null, eventId: 'e-l', startsAt: '2026-10-01T14:00:00.000Z', durationMin: 90, meetUrl: null, status: 'cancelled', originalStartsAt: null }, // jue 11:00 cancelada
  { key: 'ser-m:1', studentId: 'st-m', seriesId: 'ser-m', eventId: null, startsAt: '2026-10-01T21:00:00.000Z', durationMin: 60, meetUrl: null, status: 'scheduled', originalStartsAt: null }, // jue 18:00
  { key: 'e-t', studentId: 'st-t', seriesId: null, eventId: 'e-t', startsAt: '2026-10-01T22:30:00.000Z', durationMin: 45, meetUrl: 'https://zoom.us/j/9', status: 'scheduled', originalStartsAt: null }, // jue 19:30
]

let data: Record<string, unknown>
let failAgenda = false
let fetchMock: ReturnType<typeof vi.fn>
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-01T17:40:00Z')) // 14:40 en Buenos Aires
  data = { students: STUDENTS, series: [SER_M], classes: CLASSES, zoomUrl: ZOOM }
  failAgenda = false
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (String(url).startsWith('/api/me/zoom')) return Promise.resolve(json(200, { zoomUrl: ZOOM }))
    if (failAgenda) { failAgenda = false; return Promise.resolve(json(500, {})) }
    if (!init?.method || init.method === 'GET') return Promise.resolve(json(200, data))
    return Promise.resolve(json(200, { ok: true }))
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const click = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el) }); await flush() }
const onOpenStudent = vi.fn()
const onOpenAgenda = vi.fn()
async function mount() { render(<TeacherToday onOpenStudent={onOpenStudent} onOpenAgenda={onOpenAgenda} />); await flush() }
const rows = () => screen.getAllByTestId('today-class')
const writes = () => fetchMock.mock.calls.filter(([, i]) => i?.method && i.method !== 'GET')
  .map(([u, i]) => [String(u), i.method, i.body ? JSON.parse(i.body) : undefined])

describe('TeacherToday — el día', () => {
  it('pide la semana (lunes a lunes) y titula con el día', async () => {
    await mount()
    const agenda = fetchMock.mock.calls.map(([u]) => decodeURIComponent(String(u))).filter((u) => u.startsWith('/api/classes/agenda'))
    expect(agenda).toEqual(['/api/classes/agenda?from=2026-09-28T03:00:00.000Z&to=2026-10-05T03:00:00.000Z'])
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hoy, jueves 1 de octubre')
    expect(screen.getByText('Tenés 2 clases. La próxima es a las 18:00 con Martina.')).toBeInTheDocument()
  })

  it('las clases de hoy en orden, con la raya de "ahora" entre la pasada y la próxima', async () => {
    await mount()
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('11:00'), expect.stringContaining('18:00'), expect.stringContaining('19:30'),
    ])
    const list = within(screen.getByRole('region', { name: T.classes })).getByRole('list')
    const items = within(list).getAllByRole('listitem').map((li) => li.getAttribute('data-testid'))
    expect(items).toEqual(['today-class', 'now-line', 'today-class', 'today-class'])
    expect(screen.getByTestId('now-line')).toHaveTextContent('14:40')
  })

  it('la cancelada dice "Cancelada" y se puede restaurar', async () => {
    await mount()
    const canc = rows()[0]
    expect(canc).toHaveTextContent('Lucía Gómez')
    expect(canc).toHaveTextContent('Cancelada')
    await click(within(canc).getByRole('button', { name: T.restore }))
    expect(writes()).toEqual([['/api/classes/events/e-l', 'PATCH', { status: 'scheduled' }]])
  })

  it('la próxima: cuánto falta, "Entrar a Zoom" (Mi sala) y "Ver alumno"', async () => {
    await mount()
    const next = rows()[1]
    expect(next).toHaveTextContent('Martina Pérez')
    expect(next).toHaveTextContent('En 3 h 20 min')
    expect(within(next).getByRole('link', { name: T.enterZoom })).toHaveAttribute('href', ZOOM)
    await click(within(next).getByRole('button', { name: T.openStudent }))
    expect(onOpenStudent).toHaveBeenCalledWith('st-m', 'martina@x.com', 'Martina Pérez')
  })

  it('las demás se editan con la ventana de siempre', async () => {
    await mount()
    const later = rows()[2]
    expect(later).toHaveTextContent('Clase suelta')
    await click(within(later).getByRole('button', { name: T.edit }))
    expect(screen.getByRole('dialog', { name: D.edit })).toBeInTheDocument()
  })

  it('sin clases hoy: lo dice y ofrece agendar una', async () => {
    data = { ...data, classes: [CLASSES[0]] }
    await mount()
    expect(screen.getByText('Hoy no tenés clases.')).toBeInTheDocument()
    await click(screen.getByRole('button', { name: T.schedule }))
    expect((screen.getByLabelText(D.date) as HTMLInputElement).value).toBe('2026-10-01')
  })
})

describe('TeacherToday — la semana', () => {
  it('cada día con sus clases; hoy marcado; "Abrir la agenda"', async () => {
    await mount()
    const days = screen.getAllByTestId('week-day')
    expect(days).toHaveLength(7)
    expect(days[0]).toHaveTextContent('Lun 28')
    expect(days[0]).toHaveTextContent('17:00Tomás')
    expect(days[2]).toHaveTextContent(T.noneWeek)
    expect(within(days[3]).getByText('Jue 1').tagName).toBe('MARK')
    await click(screen.getByRole('button', { name: T.openAgenda }))
    expect(onOpenAgenda).toHaveBeenCalled()
  })

  it('"+ Nueva clase" abre la ventana con el alumno a elegir', async () => {
    await mount()
    await click(screen.getByRole('button', { name: T.newClass }))
    expect(screen.getByLabelText(D.student)).toBeInTheDocument()
  })

  it('si falla la carga, lo dice y deja reintentar', async () => {
    failAgenda = true
    await mount()
    expect(screen.getByText(/No se pudieron cargar tus clases/)).toBeInTheDocument()
    await click(screen.getByRole('button', { name: T.retry }))
    expect(rows()).toHaveLength(3)
  })
})

describe('ZoomRoomStatus — "Mi sala de Zoom" en corto', () => {
  it('cargada: "Lista" y "Cambiar el link" abre la tarjeta en una ventana', async () => {
    render(<ZoomRoomStatus />); await flush()
    expect(screen.getByTestId('zoom-status')).toHaveTextContent('Lista, la usan todas tus clases.')
    await click(screen.getByRole('button', { name: Z.change }))
    expect(screen.getByRole('dialog', { name: Z.title })).toBeInTheDocument()
    expect(screen.getByLabelText('Link de tu sala de Zoom')).toBeInTheDocument()
  })

  it('sin cargar: lo dice y ofrece cargarla; al guardar se actualiza', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      Promise.resolve(json(200, { zoomUrl: init?.method === 'PUT' ? ZOOM : null })))
    render(<ZoomRoomStatus />); await flush()
    expect(screen.getByTestId('zoom-status')).toHaveTextContent(Z.missing)
    await click(screen.getByRole('button', { name: Z.add }))
    fireEvent.change(screen.getByLabelText('Link de tu sala de Zoom'), { target: { value: ZOOM } })
    await click(screen.getByRole('button', { name: 'Guardar' }))
    await click(screen.getByRole('button', { name: Z.close }))
    expect(screen.getByTestId('zoom-status')).toHaveTextContent('Lista')
  })
})
