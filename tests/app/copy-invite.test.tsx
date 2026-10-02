// @vitest-environment jsdom
// G3 liviano — "Copiar invitación": el botón, y dónde aparece (Hoy, agenda, alumno).
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import CopyInvite, { INVITE_TEXTS as I } from '@/app/CopyInvite'
import TeacherToday from '@/app/TeacherToday'

const writeText = vi.fn(() => Promise.resolve())
beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

describe('CopyInvite', () => {
  it('copia el texto y avisa "¡Invitación copiada!"; después vuelve', async () => {
    render(<CopyInvite text="hola" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: I.copy })) })
    expect(writeText).toHaveBeenCalledWith('hola')
    expect(screen.getByRole('button', { name: I.copied })).toBeInTheDocument()
    await act(async () => { await new Promise((r) => setTimeout(r, 2600)) })
    expect(screen.getByRole('button', { name: I.copy })).toBeInTheDocument()
  })

  it('si el navegador no deja copiar, muestra el texto para copiarlo a mano', async () => {
    writeText.mockImplementationOnce(() => Promise.reject(new Error('no')))
    render(<CopyInvite text={'línea 1\nlínea 2'} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: I.copy })) })
    expect(screen.getByRole('textbox', { name: I.manual })).toHaveValue('línea 1\nlínea 2')
  })
})

describe('"Hoy": la invitación de cada clase que viene', () => {
  const ZOOM = 'https://us02web.zoom.us/j/111'
  const data = {
    students: [{ id: 'st-m', name: 'Martina Pérez', email: 'm@x.com' }, { id: 'st-l', name: 'Lucía Gómez', email: 'l@x.com' }],
    series: [],
    zoomUrl: ZOOM,
    classes: [
      { key: 'a', studentId: 'st-l', seriesId: null, eventId: 'a', startsAt: '2026-10-01T13:00:00.000Z', durationMin: 60, meetUrl: null, status: 'scheduled', originalStartsAt: null }, // 10:00, ya pasó
      { key: 'b', studentId: 'st-l', seriesId: null, eventId: 'b', startsAt: '2026-10-01T19:00:00.000Z', durationMin: 60, meetUrl: null, status: 'cancelled', originalStartsAt: null }, // 16:00 cancelada
      { key: 'c', studentId: 'st-m', seriesId: null, eventId: 'c', startsAt: '2026-10-01T21:00:00.000Z', durationMin: 60, meetUrl: null, status: 'scheduled', originalStartsAt: null }, // 18:00
    ],
  }
  it('solo en las que vienen (no en la pasada ni en la cancelada), con nombre, día y Mi sala de Zoom', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T17:40:00Z')) // 14:40 en Buenos Aires
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))))
    render(<TeacherToday onOpenStudent={() => {}} onOpenAgenda={() => {}} />)
    await flush()
    const rows = screen.getAllByTestId('today-class')
    expect(within(rows[0]).queryByRole('button', { name: I.copy })).toBeNull()
    expect(within(rows[1]).queryByRole('button', { name: I.copy })).toBeNull()
    await act(async () => { fireEvent.click(within(rows[2]).getByRole('button', { name: I.copy })) })
    expect(writeText).toHaveBeenCalledWith([
      '¡Hola Martina! Te paso los datos de tu clase de Virtual English:',
      '📅 Jueves 1 de octubre, de 18:00 a 19:00 (hora de Argentina)',
      `👉 Entrá a Zoom: ${ZOOM}`,
      '¡Nos vemos!',
    ].join('\n'))
  })
})
