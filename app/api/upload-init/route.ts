import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

  try {
    const body = await req.json()
    const { mimeType, size } = body

    if (!mimeType || typeof mimeType !== 'string') {
      return NextResponse.json({ error: 'mimeType is required' }, { status: 400 })
    }
    if (typeof size !== 'number' || size <= 0) {
      return NextResponse.json({ error: 'size must be a positive number' }, { status: 400 })
    }

    const startRes = await fetch(
      'https://generativelanguage.googleapis.com/upload/v1beta/files',
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(size),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: 'video' } }),
      }
    )

    if (!startRes.ok) {
      const err = await startRes.text()
      throw new Error(`Gemini upload start failed: ${startRes.status} — ${err.slice(0, 200)}`)
    }

    const uploadUrl = startRes.headers.get('x-goog-upload-url')
    if (!uploadUrl) throw new Error('No upload URL from Gemini')

    return NextResponse.json({ uploadUrl })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
