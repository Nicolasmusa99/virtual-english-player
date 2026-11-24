// @vitest-environment node
// Sacar el audio de un video (lib/audio.ts). Usa el ffmpeg de ffmpeg-static; genera un
// video de prueba de 3 s con ese mismo ffmpeg.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpeg from 'ffmpeg-static'
import { extractAudioMp3 } from '@/lib/audio'

describe('extractAudioMp3', () => {
  it('saca un mp3 mono chico de un video', async () => {
    const dir = mkdtempSync(join(tmpdir(), 've-test-'))
    const mp4 = join(dir, 'v.mp4')
    execFileSync(ffmpeg as string, ['-v', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=3',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
      '-shortest', '-c:v', 'libx264', '-c:a', 'aac', mp4])
    const video = new Blob([readFileSync(mp4)])
    const audio = await extractAudioMp3(video)
    expect(audio.type).toBe('audio/mpeg')
    expect(audio.size).toBeGreaterThan(1000)
    expect(audio.size).toBeLessThan(video.size)
  }, 30_000)

  it('si no es un video, tira', async () => {
    await expect(extractAudioMp3(new Blob(['no soy un video']))).rejects.toThrow(/ffmpeg/)
  }, 30_000)
})
