// GET /api/subtitles/search?q=&duration= — busca subtítulos hechos por personas (2026-11-24):
// canciones en LRCLIB y películas o series en OpenSubtitles (si está la clave). Buscar no
// gasta cupo de descargas. Lo usa la ventana "Buscar subtítulos" (app/SubtitleSearch.tsx).
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { searchLrclib, searchOpenSubtitles, type SubResult } from '@/lib/subtitleSearch'

export async function GET(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 120)
  if (!q) return NextResponse.json({ songs: [], movies: [] })
  const d = Number(req.nextUrl.searchParams.get('duration'))
  const duration = Number.isFinite(d) && d > 0 ? d : undefined

  const apiKey = process.env.OPENSUBTITLES_API_KEY
  const [songs, movies] = await Promise.all([
    searchLrclib(q, duration).catch(e => { console.warn('[subtitles] LRCLIB:', e instanceof Error ? e.message : e); return [] as SubResult[] }),
    apiKey
      ? searchOpenSubtitles(q, { apiKey }).catch(e => { console.warn('[subtitles] OpenSubtitles:', e instanceof Error ? e.message : e); return [] as SubResult[] })
      : Promise.resolve([] as SubResult[]),
  ])
  return NextResponse.json({ songs, movies })
}
