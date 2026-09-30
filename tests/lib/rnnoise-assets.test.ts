// @vitest-environment node
// Filtro de voz (P3): los archivos que el navegador baja de public/audio/rnnoise tienen
// que ser EXACTAMENTE los de la versión instalada de @sapphi-red/web-noise-suppressor.
// Si se actualiza el paquete y no se vuelven a copiar, la librería y su worklet/wasm
// quedarían de versiones distintas (y el filtro podría romperse en silencio).
// Para copiarlos: ver el comentario "FILTRO DE VOZ" en lib/voiceBoost.ts.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DENOISE_ASSETS } from '@/lib/voiceBoost'

const ROOT = process.cwd()
const DIST = join(ROOT, 'node_modules', '@sapphi-red', 'web-noise-suppressor', 'dist')
const FROM: Record<keyof typeof DENOISE_ASSETS, string> = {
  worklet: join(DIST, 'rnnoise', 'workletProcessor.js'),
  wasm: join(DIST, 'rnnoise.wasm'),
  simd: join(DIST, 'rnnoise_simd.wasm'),
}

describe('archivos del filtro de voz (public/audio/rnnoise)', () => {
  for (const [k, url] of Object.entries(DENOISE_ASSETS) as Array<[keyof typeof DENOISE_ASSETS, string]>) {
    it(`${url} es idéntico al del paquete instalado`, () => {
      const served = readFileSync(join(ROOT, 'public', url))
      const installed = readFileSync(FROM[k])
      expect(served.equals(installed)).toBe(true)
    })
  }

  it('la versión del paquete está fijada (sin ^ ni ~) en package.json', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@sapphi-red/web-noise-suppressor']).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('las licencias viajan con los archivos (MIT de la librería + BSD de RNNoise)', () => {
    const lic = readFileSync(join(ROOT, 'public', 'audio', 'rnnoise', 'LICENSE.txt'), 'utf8')
    expect(lic).toMatch(/MIT License/)
    expect(lic).toMatch(/Xiph/)
  })
})
