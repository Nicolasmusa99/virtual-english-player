import { NextRequest, NextResponse } from 'next/server'

// Node.js runtime — needed for large file handling and long timeouts
export const maxDuration = 300

async function uploadToGemini(buffer: Buffer, mimeType: string, apiKey: string): Promise<string> {
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(buffer.length),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: 'video' } }),
    }
  )
  if (!startRes.ok) {
    const err = await startRes.text()
    throw new Error(`Upload start failed: ${startRes.status} — ${err.slice(0, 200)}`)
  }
  const uploadUrl = startRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('No upload URL from Gemini')

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(buffer.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buffer,
  })
  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    throw new Error(`Upload failed: ${uploadRes.status} — ${err.slice(0, 200)}`)
  }
  const data = await uploadRes.json()
  const uri = data.file?.uri
  if (!uri) throw new Error('No file URI from Gemini')
  return uri
}

async function waitForFile(name: string, apiKey: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${apiKey}`)
    const d = await res.json()
    if (d.state === 'ACTIVE') return
    if (d.state === 'FAILED') throw new Error('Gemini failed to process the file')
  }
  throw new Error('Timeout: Gemini took too long to process the file')
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const mimeType = file.type || 'video/mp4'
    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    console.log(`[transcribe] File: ${file.name} — ${sizeMB} MB — ${mimeType}`)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    console.log(`[transcribe] Buffer ready, uploading to Gemini...`)

    const fileUri = await uploadToGemini(buffer, mimeType, apiKey)
    const fileName = 'files/' + fileUri.split('/files/')[1]
    console.log(`[transcribe] Uploaded: ${fileUri}`)

    await waitForFile(fileName, apiKey)
    console.log(`[transcribe] File ACTIVE, generating transcription...`)

    const genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { file_data: { mime_type: mimeType, file_uri: fileUri } },
              {
                text: `Transcribe ALL speech from this video/audio completely and accurately.

Return ONLY a valid SRT subtitle file in this exact format:

1
00:00:00,000 --> 00:00:04,500
Text of what was said.

2
00:00:05,000 --> 00:00:09,000
More text here.

STRICT RULES:
- Include every word spoken, nothing omitted
- Timestamps must precisely match the audio
- 1-2 sentences per block, 3-10 seconds each
- Auto-detect language, transcribe in that language
- Return ONLY the SRT content — no markdown, no code blocks, no explanations`
              }
            ]
          }],
          generationConfig: { temperature: 0.0, maxOutputTokens: 8192 }
        })
      }
    )

    if (!genRes.ok) {
      const err = await genRes.text()
      throw new Error(`Gemini error: ${genRes.status} — ${err.slice(0, 300)}`)
    }

    const genData = await genRes.json()
    const srt = genData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!srt) throw new Error('Gemini returned no transcription content')

    console.log(`[transcribe] Done — ${srt.split('\n\n').length} phrases`)

    // Clean up
    fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`, { method: 'DELETE' }).catch(() => {})

    return NextResponse.json({ srt })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[transcribe] Error:`, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
