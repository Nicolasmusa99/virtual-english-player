// Sacar el audio de un video en el servidor (2026-11-23), para mandarle a Groq solo eso.
//
// Por qué: el free tier de Groq acepta archivos de hasta 25 MB y los videos de las clases
// suelen pesar más (el de la caverna, 2:34, pesa 28,4 MB). Entonces Groq lo rechazaba y
// TODO el SRT salía de Gemini, con los tiempos corridos. El audio solo, en mp3 mono de
// 32 kbps a 16 kHz (lo que usa Whisper), pesa ~240 KB por minuto: entran ~100 minutos.
// Con ffmpeg-static (binario incluido en el deploy, ver next.config.ts) tarda menos de un
// segundo para un video de pocos minutos. Escribe en /tmp (lo único escribible en Vercel).
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const AUDIO_ARGS = ['-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '32k']
const TIMEOUT_MS = 60_000

async function ffmpegPath(): Promise<string> {
  const mod = await import('ffmpeg-static')
  const p = (mod as unknown as { default?: string | null }).default ?? (mod as unknown as string | null)
  if (!p || typeof p !== 'string') throw new Error('ffmpeg no disponible')
  return p
}

export async function extractAudioMp3(video: Blob, bin?: string): Promise<Blob> {
  const ffmpeg = bin ?? await ffmpegPath()
  const dir = await mkdtemp(join(tmpdir(), 've-audio-'))
  const input = join(dir, 'in'), output = join(dir, 'out.mp3')
  try {
    await writeFile(input, Buffer.from(await video.arrayBuffer()))
    await new Promise<void>((resolve, reject) => {
      const p = spawn(ffmpeg, ['-v', 'error', '-y', '-i', input, ...AUDIO_ARGS, output])
      let err = ''
      p.stderr.on('data', d => { err += String(d) })
      const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('ffmpeg tardó demasiado')) }, TIMEOUT_MS)
      p.on('error', e => { clearTimeout(t); reject(e) })
      p.on('close', code => {
        clearTimeout(t)
        if (code === 0) resolve(); else reject(new Error(`ffmpeg salió con ${code}: ${err.slice(0, 200)}`))
      })
    })
    const buf = await readFile(output)
    return new Blob([new Uint8Array(buf)], { type: 'audio/mpeg' })
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
