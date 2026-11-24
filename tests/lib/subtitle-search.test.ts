// Búsqueda de subtítulos humanos (lib/subtitleSearch.ts) con fetch falsos.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  queryFromFileName, searchLrclib, downloadLrclib, lrcToSrt,
  searchOpenSubtitles, downloadOpenSubtitles, resetOsTokenCache, OS_BASE,
} from '@/lib/subtitleSearch'
import { parseSRT } from '@/lib/srt'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('queryFromFileName', () => {
  it('limpia el nombre del archivo', () => {
    expect(queryFromFileName('PLATOS_ALLEGORY_-_The_Cave(video-converter.com) (3).mp4')).toBe('PLATOS ALLEGORY The Cave')
    expect(queryFromFileName('Adele - Hello (Official Music Video) [HD].mp4')).toBe('Adele Hello')
    expect(queryFromFileName('The.Matrix.1999.1080p.BluRay.x264.mkv')).toBe('The Matrix 1999')
  })
})

describe('lrcToSrt', () => {
  it('pasa LRC a SRT: cada línea dura hasta la siguiente, con tope de 7 s', () => {
    const srt = lrcToSrt('[ar:Adele]\n[00:01.50] Hello, it\'s me\n[00:05.00] I was wondering\n[00:06.20]\n[00:30.00] Hello from the other side')
    const p = parseSRT(srt)
    expect(p.map(x => x.text)).toEqual(["Hello, it's me", 'I was wondering', 'Hello from the other side'])
    expect(p[0].start).toBeCloseTo(1.5, 3)
    expect(p[0].end).toBeCloseTo(5, 3)
    expect(p[1].end).toBeCloseTo(6.2, 3)   // la línea vacía la corta
    expect(p[2].end).toBeCloseTo(34, 3)    // la última: 4 s
  })
  it('acepta varias marcas en una línea y milisegundos de 3 cifras', () => {
    const p = parseSRT(lrcToSrt('[00:10.123][00:40.000] Chorus line\n[00:15.00] x\n[00:45.00] y'))
    expect(p.filter(x => x.text === 'Chorus line').map(x => x.start)).toEqual([10.123, 40])
  })
  it('sin tiempos → vacío', () => { expect(lrcToSrt('solo texto')).toBe('') })
})

describe('LRCLIB', () => {
  it('busca, deja solo las sincronizadas y ordena por la duración más parecida', async () => {
    const f = vi.fn(async () => json([
      { id: 1, trackName: 'Hello', artistName: 'Adele', duration: 360, syncedLyrics: '[00:01.00] a' },
      { id: 2, trackName: 'Hello', artistName: 'Adele', duration: 295, syncedLyrics: '[00:01.00] a' },
      { id: 3, trackName: 'Hello', artistName: 'Other', duration: 295, syncedLyrics: null },
      { id: 4, trackName: 'Hello (inst)', duration: 295, instrumental: true, syncedLyrics: '[00:01.00] a' },
    ]))
    const r = await searchLrclib('Adele Hello', 296, f as unknown as typeof fetch)
    expect(r.map(x => x.id)).toEqual(['2', '1'])
    expect(r[0]).toMatchObject({ source: 'lrclib', kind: 'song', title: 'Hello', detail: 'Adele' })
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toContain('/api/search?q=Adele+Hello')
  })
  it('descarga por id y devuelve SRT', async () => {
    const f = vi.fn(async () => json({ id: 2, syncedLyrics: '[00:02.00] Hello' }))
    const srt = await downloadLrclib('2', f as unknown as typeof fetch)
    expect(parseSRT(srt)[0].text).toBe('Hello')
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toBe('https://lrclib.net/api/get/2')
  })
})

describe('OpenSubtitles', () => {
  beforeEach(() => resetOsTokenCache())
  const creds = { apiKey: 'K', username: 'u', password: 'p' }

  it('busca en inglés, por descargas, y devuelve el file_id', async () => {
    const f = vi.fn(async () => json({ data: [
      { id: '9', attributes: { language: 'en', download_count: 1200, release: 'The.Matrix.1999.BluRay', files: [{ file_id: 555 }], feature_details: { title: 'The Matrix', movie_name: '1999 - The Matrix', year: 1999 } } },
      { id: '10', attributes: { files: [] } },
    ] }))
    const r = await searchOpenSubtitles('The Matrix', creds, f as unknown as typeof fetch)
    expect(r).toEqual([{ source: 'opensubtitles', id: '555', kind: 'movie', title: '1999 - The Matrix', detail: '1999 · The.Matrix.1999.BluRay · 1200 descargas' }])
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain(`${OS_BASE}/subtitles?query=the+matrix&languages=en`)
    expect((init.headers as Record<string, string>)['Api-Key']).toBe('K')
  })

  it('para descargar inicia sesión una sola vez, usa el token y baja el archivo', async () => {
    const calls: string[] = []
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url)
      if (url.endsWith('/login')) return json({ token: 'T', base_url: 'vip-api.opensubtitles.com' })
      if (url.endsWith('/download')) {
        expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer T')
        expect(JSON.parse(String(init!.body))).toEqual({ file_id: 555, sub_format: 'srt' })
        return json({ link: 'https://dl.example/file.srt', remaining: 19 })
      }
      return new Response('﻿1\n00:00:01,000 --> 00:00:02,000\nHi\n')
    })
    const srt = await downloadOpenSubtitles('555', creds, f as unknown as typeof fetch)
    expect(parseSRT(srt)[0].text).toBe('Hi')
    await downloadOpenSubtitles('555', creds, f as unknown as typeof fetch)
    expect(calls.filter(u => u.endsWith('/login'))).toHaveLength(1)
    expect(calls).toContain('https://vip-api.opensubtitles.com/api/v1/download')
  })

  it('sin cupo de descargas, avisa en castellano', async () => {
    const f = vi.fn(async (url: string) => url.endsWith('/login') ? json({ token: 'T' }) : json({ message: 'limit' }, 406))
    await expect(downloadOpenSubtitles('1', creds, f as unknown as typeof fetch)).rejects.toThrow(/descargas de subtítulos de hoy/)
  })
})
