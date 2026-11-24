// POST /api/subtitles/download { source, id } → { srt } (2026-11-24). Baja el subtítulo que
// eligió el profe: la letra de LRCLIB (pasada a SRT) o el SRT de OpenSubtitles (gasta una
// descarga del cupo diario de la cuenta). El SRT queda guardado con el video.
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/authz'
import { downloadLrclib, downloadOpenSubtitles } from '@/lib/subtitleSearch'

export async function POST(req: NextRequest) {
  const gate = await requireRole('admin', 'profesor')
  if (!gate.ok) return NextResponse.json({ error: gate.status === 401 ? 'No autenticado' : 'No autorizado' }, { status: gate.status })

  const body = await req.json().catch(() => null)
  const source = body?.source, id = String(body?.id ?? '')
  if ((source !== 'lrclib' && source !== 'opensubtitles') || !/^\d{1,12}$/.test(id)) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  try {
    if (source === 'lrclib') return NextResponse.json({ srt: await downloadLrclib(id) })
    const apiKey = process.env.OPENSUBTITLES_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Falta configurar OpenSubtitles' }, { status: 500 })
    const srt = await downloadOpenSubtitles(id, {
      apiKey, username: process.env.OPENSUBTITLES_USERNAME, password: process.env.OPENSUBTITLES_PASSWORD,
    })
    return NextResponse.json({ srt })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo bajar el subtítulo'
    console.error('[subtitles] download:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
