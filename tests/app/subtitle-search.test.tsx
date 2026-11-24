// Ventana "Buscar subtítulos" (app/SubtitleSearch.tsx) con fetch falso.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import SubtitleSearch from '@/app/SubtitleSearch'

const tick = (ms = 20) => new Promise<void>(r => setTimeout(r, ms))
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
afterEach(() => vi.restoreAllMocks())

describe('SubtitleSearch', () => {
  it('busca al abrir con el nombre del video y la duración, y muestra canciones y películas', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      songs: [{ source: 'lrclib', id: '2', title: 'Hello', detail: 'Adele', durationSec: 295, kind: 'song' }],
      movies: [{ source: 'opensubtitles', id: '555', title: 'The Matrix', detail: '1999', kind: 'movie' }],
    }))
    const { getByText } = render(<SubtitleSearch initialQuery="Adele Hello" durationSec={296.4} onPick={() => {}} onClose={() => {}} />)
    await act(async () => { await tick() })
    expect(String(f.mock.calls[0][0])).toBe('/api/subtitles/search?q=Adele+Hello&duration=296')
    expect(getByText('Canciones')).toBeTruthy()
    expect(getByText('Películas y series')).toBeTruthy()
    expect(getByText('Adele · 4:55')).toBeTruthy()
  })

  it('"Usar" baja el subtítulo y lo devuelve', async () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nHello\n'
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ songs: [{ source: 'lrclib', id: '2', title: 'Hello', detail: 'Adele', kind: 'song' }], movies: [] }))
      .mockResolvedValueOnce(json({ srt }))
    const onPick = vi.fn()
    const { getByText } = render(<SubtitleSearch initialQuery="x" onPick={onPick} onClose={() => {}} />)
    await act(async () => { await tick() })
    await act(async () => { fireEvent.click(getByText('Usar')); await tick() })
    expect(onPick).toHaveBeenCalledWith(srt, 'Letra de LRCLIB')
  })

  it('al subir un video, si no encuentra nada sigue solo con la IA', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ songs: [], movies: [] }))
    const onAi = vi.fn()
    render(<SubtitleSearch initialQuery="clase propia" onPick={() => {}} onClose={() => {}} onAi={onAi} autoAiWhenEmpty />)
    await act(async () => { await tick() })
    expect(onAi).toHaveBeenCalledTimes(1)
  })

  it('si la descarga falla, avisa y no cierra', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ songs: [], movies: [{ source: 'opensubtitles', id: '1', title: 'M', detail: '', kind: 'movie' }] }))
      .mockResolvedValueOnce(json({ error: 'Se terminaron las descargas de subtítulos de hoy.' }, 502))
    const onPick = vi.fn()
    const { getByText, findByRole } = render(<SubtitleSearch initialQuery="m" onPick={onPick} onClose={() => {}} />)
    await act(async () => { await tick() })
    await act(async () => { fireEvent.click(getByText('Usar')); await tick() })
    expect((await findByRole('alert')).textContent).toMatch(/descargas de subtítulos de hoy/)
    expect(onPick).not.toHaveBeenCalled()
  })
})
