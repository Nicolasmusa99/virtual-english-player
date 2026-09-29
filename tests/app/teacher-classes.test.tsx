// @vitest-environment jsdom
// Calendario (C3) — sección "Clases" del PROFE (TeacherClasses). Reloj fijo: martes
// 29/9/2026 12:00 en Buenos Aires. Verifica QUÉ pide a la API cada botón.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import TeacherClasses, { TEACHER_CLASS_TEXTS as T } from '@/app/TeacherClasses'

const ST = 'st-1'
const SER = 'ser-1'
const MEET = 'https://meet.google.com/abc-defg-hij'
const SERIES = { id: SER, weekday: 2, time: '18:00', durationMin: 60, startsOn: '2026-09-01', endsOn: null, meetUrl: MEET }
const fija = (startsAt: string) => ({ key: `${SER}:${startsAt}`, seriesId: SER, eventId: null, startsAt, durationMin: 60, meetUrl: MEET, status: 'scheduled', originalStartsAt: null })
const CLASSES = [
  fija('2026-09-29T21:00:00.000Z'),
  { key: 'e-suelta', seriesId: null, eventId: 'e-suelta', startsAt: '2026-10-02T13:30:00.000Z', durationMin: 45, meetUrl: 'https://zoom.us/j/1', status: 'scheduled', originalStartsAt: null },
  { key: 'e-canc', seriesId: SER, eventId: 'e-canc', startsAt: '2026-10-06T21:00:00.000Z', durationMin: 60, meetUrl: MEET, status: 'cancelled', originalStartsAt: '2026-10-06T21:00:00.000Z' },
  { key: 'e-mov', seriesId: SER, eventId: 'e-mov', startsAt: '2026-10-15T20:00:00.000Z', durationMin: 90, meetUrl: MEET, status: 'scheduled', originalStartsAt: '2026-10-13T21:00:00.000Z' },
  fija('2026-10-20T21:00:00.000Z'),
]

let data: { series: unknown[]; classes: unknown[]; zoomUrl?: string | null }
let fetchMock: ReturnType<typeof vi.fn>
let nextWrite: () => Response
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-29T15:00:00Z'))
  data = { series: [SERIES], classes: CLASSES }
  nextWrite = () => json(200, { ok: true })
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') return Promise.resolve(json(200, data))
    return Promise.resolve(nextWrite())
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('confirm', vi.fn(() => true))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const writes = () => fetchMock.mock.calls.filter(([, i]) => i?.method && i.method !== 'GET')
  .map(([u, i]) => [String(u), i.method, i.body ? JSON.parse(i.body) : undefined])
async function mount() { render(<TeacherClasses studentId={ST} />); await flush() }
const row = (text: RegExp) => screen.getAllByTestId('class-row').find((r) => text.test(r.textContent ?? ''))!
const click = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el) }); await flush() }

describe('TeacherClasses — lo que se ve', () => {
  it('pide las clases de ESE alumno y muestra el horario fijo', async () => {
    await mount()
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/classes?studentId=${ST}`)
    expect(screen.getByTestId('series-row')).toHaveTextContent('Todos los martes · 18:00')
    expect(screen.getByTestId('series-row')).toHaveTextContent('60 min · desde el 1/9')
    expect(screen.getByTestId('series-row')).toHaveTextContent('Google Meet')
    expect(screen.getByText(T.tzNote)).toBeInTheDocument()
  })

  it('cada clase con su tipo y sus botones', async () => {
    await mount()
    const texts = screen.getAllByTestId('class-row').map((r) => r.textContent)
    expect(texts[0]).toMatch(/^Hoy, Mar 29\/9 · 18:00–19:00HoySe repiteEditarCancelar$/)
    expect(texts[1]).toMatch(/Vie 2\/10 · 10:30–11:15Una vezZoomEditarCancelar$/)
    expect(texts[2]).toMatch(/Mar 6\/10 · 18:00–19:00CanceladaRestaurar$/)
    expect(texts[3]).toMatch(/Jue 15\/10 · 17:00–18:30Cambió de díaera el mar 13\/10EditarCancelar$/)
  })

  it('error al cargar → mensaje + Reintentar', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(json(500, {})))
    await mount()
    expect(screen.getByText(new RegExp(T.loadError))).toBeInTheDocument()
    await click(screen.getByRole('button', { name: T.retry }))
    expect(screen.getByTestId('series-row')).toBeInTheDocument()
  })

  it('solo habla con /api/classes/**', async () => {
    await mount()
    await click(within(row(/Mar 29\/9/)).getByRole('button', { name: T.cancel }))
    expect(fetchMock.mock.calls.every(([u]) => String(u).startsWith('/api/classes'))).toBe(true)
  })
})

describe('TeacherClasses — acciones', () => {
  it('+ Horario fijo: crea con día, hora, duración, desde y link', async () => {
    data = { series: [], classes: [] }
    await mount()
    expect(screen.getByText(T.noFixed)).toBeInTheDocument()
    await click(screen.getByRole('button', { name: T.addFixed }))
    const form = screen.getByRole('form', { name: T.newFixed })
    fireEvent.change(within(form).getByLabelText(T.day), { target: { value: '4' } })
    fireEvent.change(within(form).getByLabelText(T.hour), { target: { value: '09:30' } })
    fireEvent.change(within(form).getByLabelText(T.duration), { target: { value: '45' } })
    fireEvent.change(within(form).getByLabelText(T.link), { target: { value: MEET } })
    await click(within(form).getByRole('button', { name: T.save }))
    expect(writes()).toEqual([['/api/classes/series', 'POST', { studentId: ST, weekday: 4, time: '09:30', durationMin: 45, startsOn: '2026-09-29', meetUrl: MEET }]])
    expect(screen.queryByRole('form')).toBeNull() // se cierra y recarga
    expect(fetchMock.mock.calls.filter(([, i]) => !i?.method)).toHaveLength(2)
  })

  it('el error del servidor se muestra en el formulario (y queda abierto)', async () => {
    nextWrite = () => json(400, { error: 'El link tiene que ser de Zoom, Google Meet o Teams (https)' })
    await mount()
    await click(screen.getByRole('button', { name: T.addSingle }))
    await click(screen.getByRole('button', { name: T.save }))
    expect(screen.getByRole('alert')).toHaveTextContent('El link tiene que ser de Zoom')
    expect(screen.getByRole('form', { name: T.newSingle })).toBeInTheDocument()
  })

  it('al cerrar el formulario con "Cancelar", el error se va con él', async () => {
    nextWrite = () => json(400, { error: 'Hora inválida (HH:MM)' })
    await mount()
    await click(screen.getByRole('button', { name: T.addSingle }))
    await click(screen.getByRole('button', { name: T.save }))
    expect(screen.getByRole('alert')).toHaveTextContent('Hora inválida')
    await click(within(screen.getByRole('form', { name: T.newSingle })).getByRole('button', { name: T.close }))
    expect(screen.queryByRole('form')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('+ Clase suelta: precarga hoy 18:00 y el link del horario fijo', async () => {
    await mount()
    await click(screen.getByRole('button', { name: T.addSingle }))
    const form = screen.getByRole('form', { name: T.newSingle })
    fireEvent.change(within(form).getByLabelText(T.date), { target: { value: '2026-10-09' } })
    await click(within(form).getByRole('button', { name: T.save }))
    expect(writes()).toEqual([['/api/classes/events', 'POST', { studentId: ST, date: '2026-10-09', time: '18:00', durationMin: 60, meetUrl: MEET }]])
  })

  it('Mover una fija: formulario precargado en hora de Argentina → move con su "original"', async () => {
    await mount()
    await click(within(row(/Mar 20\/10/)).getByRole('button', { name: T.edit }))
    const form = screen.getByRole('form', { name: T.moveTitle('mar 20/10') })
    expect(within(form).getByLabelText(T.date)).toHaveValue('2026-10-20')
    expect(within(form).getByLabelText(T.hour)).toHaveValue('18:00')
    fireEvent.change(within(form).getByLabelText(T.date), { target: { value: '2026-10-22' } })
    fireEvent.change(within(form).getByLabelText(T.hour), { target: { value: '17:00' } })
    await click(within(form).getByRole('button', { name: T.save }))
    expect(writes()).toEqual([['/api/classes/events', 'POST', {
      seriesId: SER, originalStartsAt: '2026-10-20T21:00:00.000Z', action: 'move', date: '2026-10-22', time: '17:00', durationMin: 60,
    }]])
  })

  it('Mover otra vez una movida: usa el martes ORIGINAL', async () => {
    await mount()
    await click(within(row(/Jue 15\/10/)).getByRole('button', { name: T.edit }))
    await click(screen.getByRole('button', { name: T.save }))
    expect(writes()[0][2]).toMatchObject({ originalStartsAt: '2026-10-13T21:00:00.000Z', date: '2026-10-15', time: '17:00', durationMin: 90 })
  })

  it('Cancelar una fija pide confirmación; si dice que no, no pasa nada', async () => {
    await mount()
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await click(within(row(/Mar 29\/9/)).getByRole('button', { name: T.cancel }))
    expect(writes()).toEqual([])
    await click(within(row(/Mar 29\/9/)).getByRole('button', { name: T.cancel }))
    expect(writes()).toEqual([['/api/classes/events', 'POST', { seriesId: SER, originalStartsAt: '2026-09-29T21:00:00.000Z', action: 'cancel' }]])
  })

  it('Restaurar una cancelada = borrar la excepción; cancelar una movida = cancelar ese martes', async () => {
    await mount()
    await click(within(row(/Mar 6\/10/)).getByRole('button', { name: T.restore }))
    await click(within(row(/Jue 15\/10/)).getByRole('button', { name: T.cancel }))
    expect(writes()).toEqual([
      ['/api/classes/events/e-canc', 'DELETE', undefined],
      ['/api/classes/events', 'POST', { seriesId: SER, originalStartsAt: '2026-10-13T21:00:00.000Z', action: 'cancel' }],
    ])
  })

  it('Una vez: Editar (PATCH) y Cancelar (queda cancelada, con confirmación)', async () => {
    await mount()
    await click(within(row(/Vie 2\/10/)).getByRole('button', { name: T.edit }))
    const form = screen.getByRole('form', { name: T.editSingle })
    expect(within(form).getByLabelText(T.hour)).toHaveValue('10:30')
    expect(within(form).getByLabelText(T.duration)).toHaveValue('45')
    await click(within(form).getByRole('button', { name: T.save }))
    await click(within(row(/Vie 2\/10/)).getByRole('button', { name: T.cancel }))
    expect(writes()).toEqual([
      ['/api/classes/events/e-suelta', 'PATCH', { date: '2026-10-02', time: '10:30', durationMin: 45, meetUrl: 'https://zoom.us/j/1' }],
      ['/api/classes/events/e-suelta', 'PATCH', { status: 'cancelled' }],
    ])
  })

  it('Terminar el horario: hasta hoy (con confirmación)', async () => {
    await mount()
    await click(within(screen.getByTestId('series-row')).getByRole('button', { name: T.end }))
    expect(writes()).toEqual([[`/api/classes/series/${SER}`, 'PATCH', { endsOn: '2026-09-29' }]])
  })

  it('Terminar un horario que todavía no empezó: se borra', async () => {
    data = { series: [{ ...SERIES, startsOn: '2026-10-06' }], classes: [] }
    await mount()
    await click(within(screen.getByTestId('series-row')).getByRole('button', { name: T.end }))
    expect(writes()).toEqual([[`/api/classes/series/${SER}`, 'DELETE', undefined]])
  })

  it('Cambiar horario: termina el viejo el día anterior y crea el nuevo desde esa fecha', async () => {
    await mount()
    await click(within(screen.getByTestId('series-row')).getByRole('button', { name: T.change }))
    const form = screen.getByRole('form', { name: T.changeFixed })
    expect(within(form).getByLabelText(T.day)).toHaveValue('2')
    expect(within(form).getByLabelText(T.from)).toHaveValue('2026-09-29')
    fireEvent.change(within(form).getByLabelText(T.day), { target: { value: '3' } })
    fireEvent.change(within(form).getByLabelText(T.from), { target: { value: '2026-10-05' } })
    await click(within(form).getByRole('button', { name: T.save }))
    expect(writes()).toEqual([
      [`/api/classes/series/${SER}`, 'PATCH', { endsOn: '2026-10-04' }],
      ['/api/classes/series', 'POST', { studentId: ST, weekday: 3, time: '18:00', durationMin: 60, startsOn: '2026-10-05', meetUrl: MEET }],
    ])
  })

  it('Cambiar horario: si crear el nuevo falla, se deshace el fin del viejo', async () => {
    let n = 0
    nextWrite = () => (++n === 2 ? json(400, { error: 'Hora inválida (HH:MM)' }) : json(200, { ok: true }))
    await mount()
    await click(within(screen.getByTestId('series-row')).getByRole('button', { name: T.change }))
    fireEvent.change(screen.getByLabelText(T.from), { target: { value: '2026-10-05' } })
    await click(screen.getByRole('button', { name: T.save }))
    expect(writes().map(([u, m, b]) => [u, m, b])).toEqual([
      [`/api/classes/series/${SER}`, 'PATCH', { endsOn: '2026-10-04' }],
      ['/api/classes/series', 'POST', expect.objectContaining({ startsOn: '2026-10-05' })],
      [`/api/classes/series/${SER}`, 'PATCH', { endsOn: null }],
    ])
    expect(screen.getByRole('alert')).toHaveTextContent('Hora inválida')
  })
})

describe('TeacherClasses — "Mi sala de Zoom" (G0)', () => {
  const ROOM = 'https://us02web.zoom.us/j/8412345678'
  it('sin link propio → la etiqueta dice "Mi sala de Zoom"', async () => {
    data = { series: [{ ...SERIES, meetUrl: null }], classes: [{ ...CLASSES[1], meetUrl: null }], zoomUrl: ROOM }
    await mount()
    expect(screen.getByTestId('series-row')).toHaveTextContent(T.room)
    expect(row(/Vie 2\/10/)).toHaveTextContent(T.room)
  })
  it('sin sala y sin link → sin etiqueta', async () => {
    data = { series: [{ ...SERIES, meetUrl: null }], classes: [] }
    await mount()
    expect(screen.getByTestId('series-row')).not.toHaveTextContent(T.room)
  })
  it('clase suelta con sala: el link arranca vacío (= usa la sala) y lo dice', async () => {
    data = { series: [SERIES], classes: [], zoomUrl: ROOM }
    await mount()
    await click(screen.getByRole('button', { name: T.addSingle }))
    const link = within(screen.getByRole('form', { name: T.newSingle })).getByLabelText(T.link)
    expect(link).toHaveValue('')
    expect(link).toHaveAttribute('placeholder', T.linkPhRoom)
  })
})
