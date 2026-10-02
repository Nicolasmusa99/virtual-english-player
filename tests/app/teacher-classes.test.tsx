// @vitest-environment jsdom
// Calendario (C3; G1) — sección "Clases" del PROFE (TeacherClasses + ClassDialog).
// Reloj fijo: martes 29/9/2026 12:00 en Buenos Aires. Verifica QUÉ pide a la API cada
// botón: "+ Nueva clase", "Editar" (con "Solo esta / Esta y las siguientes / Todas") y
// "Cancelar" (con alcance), como en Google Calendar.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import TeacherClasses, { TEACHER_CLASS_TEXTS as T } from '@/app/TeacherClasses'
import { DIALOG_TEXTS as D } from '@/app/ClassDialog'

const ST = 'st-1'
const SER = 'ser-1'
const ZOOM = 'https://us02web.zoom.us/j/111'
const OLD_MEET = 'https://meet.google.com/abc-defg-hij' // link viejo (antes de "solo Zoom"): se sigue mostrando
const SERIES = { id: SER, weekdays: [2], time: '18:00', durationMin: 60, startsOn: '2026-09-01', endsOn: null, meetUrl: ZOOM }
const fija = (startsAt: string) => ({ key: `${SER}:${startsAt}`, seriesId: SER, eventId: null, startsAt, durationMin: 60, meetUrl: ZOOM, status: 'scheduled', originalStartsAt: null })
const CLASSES = [
  fija('2026-09-29T21:00:00.000Z'),
  { key: 'e-suelta', seriesId: null, eventId: 'e-suelta', startsAt: '2026-10-02T13:30:00.000Z', durationMin: 45, meetUrl: 'https://zoom.us/j/1', status: 'scheduled', originalStartsAt: null },
  { key: 'e-canc', seriesId: SER, eventId: 'e-canc', startsAt: '2026-10-06T21:00:00.000Z', durationMin: 60, meetUrl: ZOOM, status: 'cancelled', originalStartsAt: '2026-10-06T21:00:00.000Z' },
  { key: 'e-mov', seriesId: SER, eventId: 'e-mov', startsAt: '2026-10-15T20:00:00.000Z', durationMin: 90, meetUrl: ZOOM, status: 'scheduled', originalStartsAt: '2026-10-13T21:00:00.000Z' },
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
const dialog = (name: string) => screen.getByRole('dialog', { name })
const change = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const scope = async (name: string, kind: 'edit' | 'cancel' = 'edit') => {
  const box = dialog(kind === 'edit' ? D.scopeEdit : D.scopeCancel)
  fireEvent.click(within(box).getByLabelText(name))
  await click(within(box).getByRole('button', { name: kind === 'edit' ? D.accept : D.cancelClasses }))
}

describe('TeacherClasses — lo que se ve', () => {
  it('pide las clases de ESE alumno y muestra el horario que se repite', async () => {
    await mount()
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/classes?studentId=${ST}`)
    expect(screen.getByTestId('series-row')).toHaveTextContent('Todos los martes a las 18:00')
    expect(screen.getByTestId('series-row')).toHaveTextContent('60 minutos, desde el 1 de septiembre, en Zoom')
    expect(screen.getByTestId('series-row')).toHaveTextContent('Zoom')
    expect(screen.getByText(T.tzNote)).toBeInTheDocument()
    // G1: un solo botón para crear, y ya no hay "Terminar"
    expect(screen.getByRole('button', { name: T.add })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Terminar|Horario fijo|Clase suelta/ })).toBeNull()
  })

  it('G1: un horario de varios días se nombra con todos sus días', async () => {
    data = { series: [{ ...SERIES, weekdays: [2, 4] }], classes: [] }
    await mount()
    expect(screen.getByTestId('series-row')).toHaveTextContent('Todos los martes y jueves a las 18:00')
  })

  it('un horario que todavía no empezó y ya tiene fin dice "del … al …"', async () => {
    data = { series: [{ ...SERIES, startsOn: '2026-10-06', endsOn: '2026-10-07' }], classes: [] }
    await mount()
    expect(screen.getByTestId('series-row')).toHaveTextContent('60 minutos, del 6 de octubre al 7 de octubre')
  })

  it('G3: el horario que se repite tiene "Copiar invitación" (días, horario y link)', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await mount()
    await click(within(screen.getByTestId('series-row')).getByRole('button', { name: 'Copiar invitación' }))
    expect(writeText).toHaveBeenCalledTimes(1)
    const text = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(text).toMatch(/^¡Hola! Te paso los datos de tus clases de Virtual English:/)
    expect(text).toContain('📅 Todos los martes, de 18:00 a 19:00 (hora de Argentina)')
    expect(text).toContain('👉 Entrá a Zoom: https://')
  })

  it('un link viejo de Meet se sigue mostrando como tal', async () => {
    data = { series: [{ ...SERIES, meetUrl: OLD_MEET }], classes: [] }
    await mount()
    expect(screen.getByTestId('series-row')).toHaveTextContent('Google Meet')
  })

  it('cada clase con su tipo y sus botones', async () => {
    await mount()
    const texts = screen.getAllByTestId('class-row').map((r) => r.textContent)
    // Rediseño (fase 5): fechas con palabras, sin "·"; "Hoy" resaltado (mark) en vez de etiqueta aparte
    expect(texts[0]).toMatch(/^Hoy martes 29 de septiembre18:00–19:00Se repiteEditarCancelar$/)
    expect(texts[1]).toMatch(/^Viernes 2 de octubre10:30–11:15Una vez, en ZoomEditarCancelar$/)
    expect(texts[2]).toMatch(/^Martes 6 de octubre18:00–19:00CanceladaRestaurar$/)
    expect(texts[3]).toMatch(/^Jueves 15 de octubre17:00–18:30Cambió de día, era el martes 13 de octubreEditarCancelar$/)
    expect(within(screen.getAllByTestId('class-row')[0]).getByText('Hoy').tagName).toBe('MARK')
  })

  it('error al cargar → mensaje + Reintentar', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(json(500, {})))
    await mount()
    expect(screen.getByText(new RegExp(T.loadError))).toBeInTheDocument()
    await click(screen.getByRole('button', { name: T.retry }))
    expect(screen.getByTestId('series-row')).toBeInTheDocument()
  })
})

describe('"+ Nueva clase" (ventana tipo Google)', () => {
  it('abre con hoy 18:00–19:00, sin repetir, y Mi sala de Zoom', async () => {
    data = { series: [], classes: [], zoomUrl: ZOOM }
    await mount()
    await click(screen.getByRole('button', { name: T.add }))
    const box = dialog(D.create)
    expect(within(box).getByLabelText(D.date)).toHaveValue('2026-09-29')
    expect(within(box).getByLabelText(D.start)).toHaveValue('18:00')
    expect(within(box).getByLabelText(D.end)).toHaveValue('19:00')
    expect(within(box).getByText('1 h')).toBeInTheDocument()
    expect(within(box).getByLabelText(D.repeat)).toHaveValue('none')
    expect(within(box).getByText(D.room)).toBeInTheDocument()
    expect(within(box).getByText(D.tz)).toBeInTheDocument()
  })

  it('sin repetir → clase suelta', async () => {
    await mount()
    await click(screen.getByRole('button', { name: T.add }))
    const box = dialog(D.create)
    change(within(box).getByLabelText(D.date), '2026-10-09')
    change(within(box).getByLabelText(D.start), '10:00') // corre el fin: 11:00
    await click(within(box).getByRole('button', { name: D.save }))
    expect(writes()).toEqual([['/api/classes/events', 'POST', { studentId: ST, date: '2026-10-09', time: '10:00', durationMin: 60, meetUrl: '' }]])
    expect(screen.queryByRole('dialog')).toBeNull() // se cierra y recarga
  })

  it('"Todas las semanas el <día>" → horario de ese día, con fin', async () => {
    await mount()
    await click(screen.getByRole('button', { name: T.add }))
    const box = dialog(D.create)
    change(within(box).getByLabelText(D.date), '2026-10-06')
    change(within(box).getByLabelText(D.end), '19:30')
    change(within(box).getByLabelText(D.repeat), 'weekly')
    expect(within(box).getByRole('option', { name: 'Todas las semanas el martes' })).toBeInTheDocument()
    change(within(box).getByLabelText(D.ends), 'on')
    change(within(box).getByLabelText(D.endsOn), '2026-12-15')
    await click(within(box).getByRole('button', { name: D.save }))
    expect(writes()).toEqual([['/api/classes/series', 'POST', {
      studentId: ST, weekdays: [2], time: '18:00', durationMin: 90, startsOn: '2026-10-06', endsOn: '2026-12-15', meetUrl: '',
    }]])
  })

  it('"Personalizado": martes y jueves', async () => {
    await mount()
    await click(screen.getByRole('button', { name: T.add }))
    const box = dialog(D.create)
    change(within(box).getByLabelText(D.date), '2026-10-06')
    change(within(box).getByLabelText(D.repeat), 'custom')
    const days = within(box).getByRole('group', { name: D.days })
    expect(within(days).getByRole('button', { name: 'Ma' })).toHaveAttribute('aria-pressed', 'true') // arranca con el día de la fecha
    fireEvent.click(within(days).getByRole('button', { name: 'Ju' }))
    expect(within(box).getByRole('option', { name: 'Todas las semanas el martes y el jueves' })).toBeInTheDocument()
    await click(within(box).getByRole('button', { name: D.save }))
    expect(writes()[0][2]).toMatchObject({ weekdays: [2, 4], endsOn: null })
  })

  it('validación local: sin días o duración imposible → no manda nada', async () => {
    await mount()
    await click(screen.getByRole('button', { name: T.add }))
    const box = dialog(D.create)
    change(within(box).getByLabelText(D.end), '18:05')
    await click(within(box).getByRole('button', { name: D.save }))
    expect(within(box).getByRole('alert')).toHaveTextContent(/durar/)
    change(within(box).getByLabelText(D.end), '19:00')
    change(within(box).getByLabelText(D.repeat), 'custom')
    fireEvent.click(within(box).getByRole('button', { name: 'Ma' })) // saca el único día
    await click(within(box).getByRole('button', { name: D.save }))
    expect(within(box).getByRole('alert')).toHaveTextContent(/al menos un día/)
    expect(writes()).toEqual([])
  })

  it('el error del servidor (p. ej. link que no es de Zoom) se muestra y la ventana queda abierta', async () => {
    nextWrite = () => json(400, { error: 'Tiene que ser un link de Zoom (https://…zoom.us/…)' })
    await mount()
    await click(screen.getByRole('button', { name: T.add }))
    const box = dialog(D.create)
    change(within(box).getByLabelText(D.link), 'https://meet.google.com/x')
    await click(within(box).getByRole('button', { name: D.save }))
    expect(within(box).getByRole('alert')).toHaveTextContent('Tiene que ser un link de Zoom')
  })

  it('Cancelar o Escape cierran sin guardar (y el error se va)', async () => {
    await mount()
    await click(screen.getByRole('button', { name: T.add }))
    await click(within(dialog(D.create)).getByRole('button', { name: D.cancel }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await click(screen.getByRole('button', { name: T.add }))
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(writes()).toEqual([])
  })

  it('con Mi sala: "Cambiar" deja poner un link propio, y "Usar Mi sala" vuelve', async () => {
    data = { series: [], classes: [], zoomUrl: ZOOM }
    await mount()
    await click(screen.getByRole('button', { name: T.add }))
    const box = dialog(D.create)
    await click(within(box).getByRole('button', { name: D.change }))
    change(within(box).getByLabelText(D.link), 'https://zoom.us/j/999')
    await click(within(box).getByRole('button', { name: D.useRoom }))
    await click(within(box).getByRole('button', { name: D.save }))
    expect(writes()[0][2]).toMatchObject({ meetUrl: '' })
  })
})

describe('Editar una clase que se repite → "Solo esta / Esta y las siguientes / Todas"', () => {
  async function editTue20(mod: (box: HTMLElement) => void) {
    await mount()
    await click(within(row(/Martes 20 de octubre/)).getByRole('button', { name: T.edit }))
    const box = dialog(D.edit)
    expect(within(box).getByLabelText(D.date)).toHaveValue('2026-10-20')
    expect(within(box).getByLabelText(D.start)).toHaveValue('18:00')
    expect(within(box).getByLabelText(D.repeat)).toHaveValue('weekly')
    expect(within(box).queryByRole('option', { name: D.none })).toBeNull() // no se ofrece "No se repite"
    mod(box)
    await click(within(box).getByRole('button', { name: D.save }))
  }

  it('sin cambios → se cierra sin preguntar ni guardar', async () => {
    await editTue20(() => {})
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(writes()).toEqual([])
  })

  it('Solo esta clase → la mueve (excepción con su original)', async () => {
    await editTue20((box) => { change(within(box).getByLabelText(D.date), '2026-10-22'); change(within(box).getByLabelText(D.start), '17:00') })
    await scope(D.only)
    expect(writes()).toEqual([['/api/classes/events', 'POST', {
      seriesId: SER, originalStartsAt: '2026-10-20T21:00:00.000Z', action: 'move', date: '2026-10-22', time: '17:00', durationMin: 60, meetUrl: ZOOM,
    }]])
  })

  it('Esta y las siguientes → corta el horario desde esa clase', async () => {
    await editTue20((box) => change(within(box).getByLabelText(D.start), '19:00'))
    await scope(D.following)
    expect(writes()).toEqual([[`/api/classes/series/${SER}`, 'PATCH', {
      scope: 'following', occurrence: '2026-10-20T21:00:00.000Z',
      weekdays: [2], time: '19:00', durationMin: 60, startsOn: '2026-10-20', endsOn: null, meetUrl: ZOOM,
    }]])
  })

  it('Todas las clases → cambia el horario entero (sin tocar desde cuándo empieza)', async () => {
    await editTue20((box) => change(within(box).getByLabelText(D.start), '19:00'))
    await scope(D.all)
    expect(writes()).toEqual([[`/api/classes/series/${SER}`, 'PATCH', {
      scope: 'all', weekdays: [2], time: '19:00', durationMin: 60, endsOn: null, meetUrl: ZOOM,
    }]])
  })

  it('si cambió cómo se repite (días o fin), "Solo esta" no se puede elegir', async () => {
    await editTue20((box) => {
      change(within(box).getByLabelText(D.repeat), 'custom')
      fireEvent.click(within(within(box).getByRole('group', { name: D.days })).getByRole('button', { name: 'Ju' }))
    })
    const box = dialog(D.scopeEdit)
    expect(within(box).getByLabelText(D.only)).toBeDisabled()
    expect(within(box).getByLabelText(D.following)).toBeChecked()
    expect(within(box).getByText(D.onlyDisabled)).toBeInTheDocument()
    await click(within(box).getByRole('button', { name: D.accept }))
    expect(writes()[0][2]).toMatchObject({ scope: 'following', weekdays: [2, 4] })
  })

  it('una clase MOVIDA: precarga la nueva fecha y usa el martes ORIGINAL como clase del horario', async () => {
    await mount()
    await click(within(row(/Jueves 15 de octubre/)).getByRole('button', { name: T.edit }))
    const box = dialog(D.edit)
    expect(within(box).getByLabelText(D.date)).toHaveValue('2026-10-15')
    expect(within(box).getByLabelText(D.end)).toHaveValue('18:30')
    change(within(box).getByLabelText(D.start), '16:00')
    await click(within(box).getByRole('button', { name: D.save }))
    await scope(D.only)
    expect(writes()[0][2]).toMatchObject({ originalStartsAt: '2026-10-13T21:00:00.000Z', date: '2026-10-15', time: '16:00', durationMin: 90 })
  })

  it('"Editar" en el horario → cambia todas sus clases (scope all, con desde cuándo)', async () => {
    await mount()
    await click(within(screen.getByTestId('series-row')).getByRole('button', { name: T.edit }))
    const box = dialog(D.editSeries)
    expect(within(box).getByLabelText(D.date)).toHaveValue('2026-09-01')
    change(within(box).getByLabelText(D.ends), 'on')
    change(within(box).getByLabelText(D.endsOn), '2026-12-15')
    await click(within(box).getByRole('button', { name: D.save }))
    expect(screen.queryByRole('dialog', { name: D.scopeEdit })).toBeNull() // no pregunta: es el horario entero
    expect(writes()).toEqual([[`/api/classes/series/${SER}`, 'PATCH', {
      scope: 'all', weekdays: [2], time: '18:00', durationMin: 60, startsOn: '2026-09-01', endsOn: '2026-12-15', meetUrl: ZOOM,
    }]])
  })
})

describe('Cancelar', () => {
  it('una clase que se repite → pregunta el alcance', async () => {
    await mount()
    await click(within(row(/Martes 20 de octubre/)).getByRole('button', { name: T.cancel }))
    const box = dialog(D.scopeCancel)
    expect(box).toHaveTextContent(D.onlyCancelHint)
    expect(box).toHaveTextContent(D.followingCancelHint)
    expect(box).toHaveTextContent(D.allCancelHint)
    await click(within(box).getByRole('button', { name: D.cancelClasses })) // por defecto: solo esta
    expect(writes()).toEqual([['/api/classes/events', 'POST', { seriesId: SER, originalStartsAt: '2026-10-20T21:00:00.000Z', action: 'cancel' }]])
  })

  it('esta y las siguientes / todas → DELETE con alcance', async () => {
    await mount()
    await click(within(row(/Martes 20 de octubre/)).getByRole('button', { name: T.cancel }))
    await scope(D.following, 'cancel')
    await click(within(row(/Jueves 15 de octubre/)).getByRole('button', { name: T.cancel }))
    await scope(D.all, 'cancel')
    expect(writes()).toEqual([
      [`/api/classes/series/${SER}?scope=following&occurrence=2026-10-20T21%3A00%3A00.000Z`, 'DELETE', undefined],
      [`/api/classes/series/${SER}?scope=all`, 'DELETE', undefined],
    ])
  })

  it('"Volver" no cancela nada', async () => {
    await mount()
    await click(within(row(/Martes 20 de octubre/)).getByRole('button', { name: T.cancel }))
    await click(within(dialog(D.scopeCancel)).getByRole('button', { name: D.back }))
    expect(writes()).toEqual([])
  })

  it('una clase suelta → confirmación simple y queda cancelada', async () => {
    await mount()
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await click(within(row(/Viernes 2 de octubre/)).getByRole('button', { name: T.cancel }))
    expect(writes()).toEqual([])
    await click(within(row(/Viernes 2 de octubre/)).getByRole('button', { name: T.cancel }))
    expect(writes()).toEqual([['/api/classes/events/e-suelta', 'PATCH', { status: 'cancelled' }]])
  })

  it('Restaurar una cancelada del horario = borrar la excepción', async () => {
    await mount()
    await click(within(row(/Martes 6 de octubre/)).getByRole('button', { name: T.restore }))
    expect(writes()).toEqual([['/api/classes/events/e-canc', 'DELETE', undefined]])
  })
})

describe('Editar una clase suelta', () => {
  it('sin repetir → PATCH de esa clase', async () => {
    await mount()
    await click(within(row(/Viernes 2 de octubre/)).getByRole('button', { name: T.edit }))
    const box = dialog(D.edit)
    expect(within(box).getByLabelText(D.start)).toHaveValue('10:30')
    expect(within(box).getByLabelText(D.end)).toHaveValue('11:15')
    expect(within(box).getByLabelText(D.link)).toHaveValue('https://zoom.us/j/1')
    await click(within(box).getByRole('button', { name: D.save }))
    expect(writes()).toEqual([['/api/classes/events/e-suelta', 'PATCH', { date: '2026-10-02', time: '10:30', durationMin: 45, meetUrl: 'https://zoom.us/j/1' }]])
  })

  it('ponerle "Se repite" → crea el horario y reemplaza la suelta', async () => {
    await mount()
    await click(within(row(/Viernes 2 de octubre/)).getByRole('button', { name: T.edit }))
    const box = dialog(D.edit)
    change(within(box).getByLabelText(D.repeat), 'weekly')
    await click(within(box).getByRole('button', { name: D.save }))
    expect(writes()).toEqual([['/api/classes/series', 'POST', {
      studentId: ST, weekdays: [5], time: '10:30', durationMin: 45, startsOn: '2026-10-02', endsOn: null,
      meetUrl: 'https://zoom.us/j/1', replacesEventId: 'e-suelta',
    }]])
  })
})

describe('Solo habla con /api/classes/**', () => {
  it('ningún pedido sale de ahí', async () => {
    await mount()
    await click(within(row(/Martes 20 de octubre/)).getByRole('button', { name: T.cancel }))
    await scope(D.following, 'cancel')
    expect(fetchMock.mock.calls.every(([u]) => String(u).startsWith('/api/classes'))).toBe(true)
  })
})
