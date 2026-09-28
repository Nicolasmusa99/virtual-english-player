// "Voces más claras" (lib/voiceBoost.ts) — mapeo de la barra y manejo de la cadena
// de Web Audio contra un AudioContext FALSO (jsdom no tiene Web Audio).
// Lo central: sin uso no se toca nada; REGLA DE ORO (nunca enganchar con el contexto
// dormido ni un video sin crossOrigin → nunca silencio); en 0 los filtros salen del
// circuito; un video se engancha una sola vez.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  BYPASS_AFTER_MS,
  RESUME_TIMEOUT_MS,
  VOICE_BOOST_FREQS,
  VOICE_BOOST_MAX_DB,
  clampVoiceBoost,
  createVoiceBoost,
  voiceBoostBands,
  voiceBoostLabel,
} from '@/lib/voiceBoost'

// ─── AudioContext falso ─────────────────────────────────────────────────────
class FakeParam {
  value: number
  targets: Array<[number, number, number]> = []
  constructor(v = 0) { this.value = v }
  setTargetAtTime(v: number, t: number, tc: number) { this.targets.push([v, t, tc]); this.value = v; return this }
}
class FakeNode {
  outputs: FakeNode[] = []
  constructor(public kind: string) {}
  connect(n: FakeNode) { this.outputs.push(n); return n }
  disconnect() { this.outputs = [] }
}
class FakeBiquad extends FakeNode {
  type = ''
  frequency = new FakeParam()
  Q = new FakeParam(1)
  gain = new FakeParam()
  constructor() { super('biquad') }
}
class FakeGain extends FakeNode {
  gain = new FakeParam(1)
  constructor() { super('gain') }
}
class FakeSource extends FakeNode {
  constructor(public el: HTMLMediaElement) { super('source') }
}
class FakeCtx {
  state: AudioContextState
  currentTime = 12.5
  destination = new FakeNode('destination')
  sources: FakeSource[] = []
  resumeCalls = 0
  // Qué hace resume(): 'run' arranca, 'hang' no resuelve nunca, 'stay' resuelve sin arrancar.
  constructor(state: AudioContextState = 'running', public onResume: 'run' | 'hang' | 'stay' = 'run') { this.state = state }
  resume() {
    this.resumeCalls++
    if (this.onResume === 'hang') return new Promise<void>(() => {})
    if (this.onResume === 'run') this.state = 'running'
    return Promise.resolve()
  }
  createMediaElementSource(el: HTMLMediaElement) { const s = new FakeSource(el); this.sources.push(s); return s }
  createBiquadFilter() { return new FakeBiquad() }
  createGain() { return new FakeGain() }
}

function video(cross: string | null = 'anonymous') {
  const v = document.createElement('video')
  if (cross !== null) v.crossOrigin = cross
  return v
}
function setup(ctx = new FakeCtx()) {
  const createContext = vi.fn(() => ctx as unknown as AudioContext)
  const vb = createVoiceBoost({ createContext })
  return { vb, ctx, createContext }
}
// Recorre la cadena desde la fuente: [tipos...] hasta el destino.
function path(ctx: FakeCtx, i = 0): string[] {
  const out: string[] = []
  let n: FakeNode | undefined = ctx.sources[i]
  while (n) {
    out.push(n instanceof FakeBiquad ? n.type : n.kind)
    if (n === ctx.destination) break
    n = n.outputs[0]
  }
  return out
}
const chainOf = (ctx: FakeCtx, i = 0) => {
  const low = ctx.sources[i].outputs[0] as FakeBiquad
  const voice = low.outputs[0] as FakeBiquad
  const high = voice.outputs[0] as FakeBiquad
  const trim = high.outputs[0] as FakeGain
  return { low, voice, high, trim }
}
const FULL = ['source', 'lowshelf', 'peaking', 'highshelf', 'gain', 'destination']
const BYPASS = ['source', 'destination']

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

// ─────────────────────────────────────────────────────────────────────────────
describe('mapeo de la barra (lee la tabla: se puede afinar sin tocar los tests)', () => {
  const M = VOICE_BOOST_MAX_DB

  it('0 = sin efecto: ceros exactos (no -0)', () => {
    expect(voiceBoostBands(0)).toEqual({ lowDb: 0, voiceDb: 0, highDb: 0, trimDb: 0 })
    for (const v of Object.values(voiceBoostBands(0))) expect(Object.is(v, 0)).toBe(true)
  })

  it('al máximo (100) = exactamente la tabla', () => {
    expect(voiceBoostBands(100)).toEqual({ lowDb: M.low, voiceDb: M.voice, highDb: M.high, trimDb: M.trim })
  })

  it('crece parejo: proporcional a la barra (lineal en dB) y nunca retrocede', () => {
    for (const a of [1, 10, 25, 33, 50, 67, 75, 99]) {
      const b = voiceBoostBands(a)
      const k = a / 100
      expect(b.lowDb).toBeCloseTo(M.low * k, 10)
      expect(b.voiceDb).toBeCloseTo(M.voice * k, 10)
      expect(b.highDb).toBeCloseTo(M.high * k, 10)
      expect(b.trimDb).toBeCloseTo(M.trim * k, 10)
    }
    let prev = voiceBoostBands(0)
    for (let a = 1; a <= 100; a++) {
      const b = voiceBoostBands(a)
      expect(Math.abs(b.lowDb)).toBeGreaterThanOrEqual(Math.abs(prev.lowDb))
      expect(Math.abs(b.highDb)).toBeGreaterThanOrEqual(Math.abs(prev.highDb))
      prev = b
    }
  })

  it('la tabla tiene sentido: graves y agudos BAJAN, la voz no baja, la compensación no sube', () => {
    expect(M.low).toBeLessThan(0)
    expect(M.high).toBeLessThan(0)
    expect(M.voice).toBeGreaterThanOrEqual(0)
    expect(M.trim).toBeLessThanOrEqual(0)
    expect(VOICE_BOOST_FREQS.lowShelfHz).toBeLessThan(300) // el corte de graves no invade la base de la voz
    expect(VOICE_BOOST_FREQS.highShelfHz).toBeGreaterThan(4000) // ni el de agudos la zona de inteligibilidad
  })

  it('valores fuera de rango o raros se acotan a 0..100 enteros', () => {
    expect(clampVoiceBoost(-5)).toBe(0)
    expect(clampVoiceBoost(250)).toBe(100)
    expect(clampVoiceBoost(NaN)).toBe(0)
    expect(clampVoiceBoost(Infinity)).toBe(0)
    expect(clampVoiceBoost(33.6)).toBe(34)
    expect(voiceBoostBands(500)).toEqual(voiceBoostBands(100))
  })

  it('texto (solo para lectores de pantalla): Apagado / Suave / Medio / Fuerte', () => {
    expect(voiceBoostLabel(0)).toBe('Apagado')
    expect(voiceBoostLabel(1)).toBe('Suave')
    expect(voiceBoostLabel(33)).toBe('Suave')
    expect(voiceBoostLabel(34)).toBe('Medio')
    expect(voiceBoostLabel(66)).toBe('Medio')
    expect(voiceBoostLabel(67)).toBe('Fuerte')
    expect(voiceBoostLabel(100)).toBe('Fuerte')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// LÍMITE DE SEGURIDAD: ningún punto de la curva pasa de 0 dB (si pasa, con videos
// mezclados fuerte el audio satura y cruje). La curva se calcula con las MISMAS
// fórmulas que usa el navegador para BiquadFilterNode (spec de Web Audio; verificado
// contra Chrome el 2026-09-28: coincide al 0,1 dB en 14 frecuencias).
type BiquadType = 'lowshelf' | 'peaking' | 'highshelf'
function biquadDb(type: BiquadType, f0: number, gainDb: number, q: number, fs: number) {
  const A = Math.pow(10, gainDb / 40)
  const w0 = (2 * Math.PI * f0) / fs
  const c = Math.cos(w0)
  const sn = Math.sin(w0)
  let b: [number, number, number]
  let a: [number, number, number]
  if (type === 'peaking') {
    const al = sn / (2 * q)
    b = [1 + al * A, -2 * c, 1 - al * A]
    a = [1 + al / A, -2 * c, 1 - al / A]
  } else {
    const r = 2 * (sn / 2) * Math.SQRT2 * Math.sqrt(A) // 2·αS·√A con S = 1
    if (type === 'lowshelf') {
      b = [A * ((A + 1) - (A - 1) * c + r), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - r)]
      a = [(A + 1) + (A - 1) * c + r, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - r]
    } else {
      b = [A * ((A + 1) + (A - 1) * c + r), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - r)]
      a = [(A + 1) - (A - 1) * c + r, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - r]
    }
  }
  return (hz: number) => {
    const w = (2 * Math.PI * hz) / fs
    const part = (x: [number, number, number]) =>
      [x[0] + x[1] * Math.cos(w) + x[2] * Math.cos(2 * w), -(x[1] * Math.sin(w) + x[2] * Math.sin(2 * w))]
    const [nr, ni] = part(b)
    const [dr, di] = part(a)
    return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di))
  }
}
function curveDb(amount: number, fs: number) {
  const bands = voiceBoostBands(amount)
  const F = VOICE_BOOST_FREQS
  const filters = [
    biquadDb('lowshelf', F.lowShelfHz, bands.lowDb, 0, fs),
    biquadDb('peaking', F.voiceHz, bands.voiceDb, F.voiceQ, fs),
    biquadDb('highshelf', F.highShelfHz, bands.highDb, 0, fs),
  ]
  return (hz: number) => filters.reduce((acc, f) => acc + f(hz), 0) + bands.trimDb
}
const AUDIBLE = Array.from({ length: 500 }, (_, i) => 20 * Math.pow(1000, i / 499)) // 20 Hz–20 kHz

describe('límite de seguridad: nada pasa de 0 dB (no satura)', () => {
  for (const fs of [44100, 48000]) {
    it('a ' + fs + ' Hz: en ninguna posición de la barra la curva supera 0 dB', () => {
      for (const pos of [1, 10, 25, 50, 75, 100]) {
        const c = curveDb(pos, fs)
        const max = Math.max(...AUDIBLE.map(c))
        expect(max, 'barra en ' + pos + ': pico de la curva ' + max.toFixed(2) + ' dB').toBeLessThanOrEqual(0)
      }
    })
  }

  it('la fórmula es la del navegador: tabla A medida en Chrome (48 kHz, al máximo)', () => {
    // Referencia medida con getFrequencyResponse de Chrome para la tabla A. Valida la
    // FÓRMULA; si la tabla deja de ser la A, este test no aplica y no controla nada.
    const M = VOICE_BOOST_MAX_DB
    const F = VOICE_BOOST_FREQS
    const isA = M.low === -20 && M.voice === 2 && M.high === -14 && M.trim === -2.5 &&
      F.lowShelfHz === 150 && F.voiceHz === 2000 && F.voiceQ === 0.7 && F.highShelfHz === 7000
    if (!isA) return
    const chrome: Array<[number, number]> = [[100, -17.8], [300, -4.5], [500, -2.6], [1000, -1.6], [2000, -0.6], [8000, -11.1], [12000, -15.4]]
    const c = curveDb(100, 48000)
    for (const [hz, db] of chrome) expect(c(hz)).toBeCloseTo(db, 1)
  })

  it('la voz se destaca: al máximo, el fondo (100 Hz y 12 kHz) queda ≥ 10 dB debajo de la voz (1–2 kHz)', () => {
    const c = curveDb(100, 48000)
    const voz = Math.min(c(1000), c(2000))
    expect(voz - c(100)).toBeGreaterThanOrEqual(10)
    expect(voz - c(12000)).toBeGreaterThanOrEqual(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('sin uso no se toca nada (camino nativo, bit a bit)', () => {
  it('attach + barra en 0 → no crea AudioContext ni engancha el video', async () => {
    const { vb, createContext, ctx } = setup()
    expect(await vb.attach(video())).toBe('off')
    expect(await vb.set(0)).toBe('off')
    expect(createContext).not.toHaveBeenCalled()
    expect(ctx.sources).toHaveLength(0)
  })

  it('attach(null) no rompe', async () => {
    const { vb } = setup()
    expect(await vb.attach(null)).toBe('off')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('primer uso', () => {
  it('crea el contexto UNA vez, dentro del set (el gesto), y engancha el video con la cadena completa', async () => {
    const { vb, createContext, ctx } = setup()
    await vb.attach(video())
    expect(await vb.set(50)).toBe('active')
    await vb.set(60)
    expect(createContext).toHaveBeenCalledTimes(1)
    expect(ctx.sources).toHaveLength(1)
    expect(path(ctx)).toEqual(FULL)
  })

  it('el contexto se crea SINCRÓNICAMENTE dentro de set() (antes de cualquier await)', () => {
    const { vb, createContext } = setup()
    void vb.set(40) // sin await: tiene que haberse creado ya
    expect(createContext).toHaveBeenCalledTimes(1)
  })

  it('los filtros quedan configurados como la tabla (VOICE_BOOST_FREQS / VOICE_BOOST_MAX_DB)', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video())
    await vb.set(100)
    const { low, voice, high, trim } = chainOf(ctx)
    const F = VOICE_BOOST_FREQS, M = VOICE_BOOST_MAX_DB
    expect([low.type, low.frequency.value]).toEqual(['lowshelf', F.lowShelfHz])
    expect([voice.type, voice.frequency.value, voice.Q.value]).toEqual(['peaking', F.voiceHz, F.voiceQ])
    expect([high.type, high.frequency.value]).toEqual(['highshelf', F.highShelfHz])
    expect(low.gain.value).toBe(M.low)
    expect(voice.gain.value).toBe(M.voice)
    expect(high.gain.value).toBe(M.high)
    expect(trim.gain.value).toBeCloseTo(Math.pow(10, M.trim / 20), 10)
  })

  it('los cambios van suavizados (setTargetAtTime desde el tiempo actual, sin saltos)', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video())
    await vb.set(50)
    const { voice } = chainOf(ctx)
    expect(voice.gain.targets.at(-1)).toEqual([VOICE_BOOST_MAX_DB.voice * 0.5, 12.5, 0.05])
  })

  it('set antes de attach: engancha al llegar el video', async () => {
    const { vb, ctx } = setup()
    expect(await vb.set(50)).toBe('unavailable') // todavía no hay video
    expect(await vb.attach(video())).toBe('active')
    expect(path(ctx)).toEqual(FULL)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('REGLA DE ORO: si no se puede enganchar, camino normal (nunca silencio)', () => {
  it('contexto dormido que no arranca → unavailable y el video NO se engancha', async () => {
    const { vb, ctx } = setup(new FakeCtx('suspended', 'stay'))
    await vb.attach(video())
    const p = vb.set(50)
    await vi.advanceTimersByTimeAsync(RESUME_TIMEOUT_MS)
    expect(await p).toBe('unavailable')
    expect(ctx.sources).toHaveLength(0)
  })

  it('resume() que nunca responde → se rinde al tiempo límite, sin enganchar', async () => {
    const { vb, ctx } = setup(new FakeCtx('suspended', 'hang'))
    await vb.attach(video())
    const p = vb.set(50)
    await vi.advanceTimersByTimeAsync(RESUME_TIMEOUT_MS)
    expect(await p).toBe('unavailable')
    expect(ctx.sources).toHaveLength(0)
  })

  it('contexto dormido que arranca con resume() → engancha', async () => {
    const { vb, ctx } = setup(new FakeCtx('suspended', 'run'))
    await vb.attach(video())
    expect(await vb.set(50)).toBe('active')
    expect(ctx.resumeCalls).toBeGreaterThan(0)
    expect(ctx.sources).toHaveLength(1)
  })

  it('después de un unavailable, un nuevo set (p. ej. un clic) reintenta y engancha', async () => {
    const ctx = new FakeCtx('suspended', 'stay')
    const { vb } = setup(ctx)
    await vb.attach(video())
    const p = vb.set(50)
    await vi.advanceTimersByTimeAsync(RESUME_TIMEOUT_MS)
    expect(await p).toBe('unavailable')
    ctx.onResume = 'run' // ahora hay gesto
    expect(await vb.set(50)).toBe('active')
    expect(ctx.sources).toHaveLength(1)
  })

  it('video SIN crossOrigin → unavailable y NO se engancha (daría silencio con videos de otro origen)', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video(null))
    expect(await vb.set(50)).toBe('unavailable')
    expect(ctx.sources).toHaveLength(0)
  })

  it('navegador sin Web Audio (el constructor tira) → unavailable, sin romper, y no reintenta crear', async () => {
    const createContext = vi.fn(() => { throw new Error('no Web Audio') })
    const vb = createVoiceBoost({ createContext })
    await vb.attach(video())
    expect(await vb.set(50)).toBe('unavailable')
    expect(await vb.set(70)).toBe('unavailable')
    expect(createContext).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('volver a 0', () => {
  it('baja a 0 dB y, ya asentado, saca los filtros del circuito (video → parlantes directo)', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video())
    await vb.set(80)
    const { low, voice, high, trim } = chainOf(ctx)
    expect(await vb.set(0)).toBe('off')
    expect([low.gain.value, voice.gain.value, high.gain.value, trim.gain.value]).toEqual([0, 0, 0, 1])
    expect(path(ctx)).toEqual(FULL) // todavía adentro mientras baja
    await vi.advanceTimersByTimeAsync(BYPASS_AFTER_MS)
    expect(path(ctx)).toEqual(BYPASS)
  })

  it('si se vuelve a subir antes de que se saquen los filtros, se quedan adentro', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video())
    await vb.set(80)
    await vb.set(0)
    await vi.advanceTimersByTimeAsync(BYPASS_AFTER_MS / 2)
    await vb.set(30)
    await vi.advanceTimersByTimeAsync(BYPASS_AFTER_MS * 2)
    expect(path(ctx)).toEqual(FULL)
  })

  it('subir otra vez desde 0 vuelve a meter los filtros, sin re-enganchar el video', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video())
    await vb.set(80)
    await vb.set(0)
    await vi.advanceTimersByTimeAsync(BYPASS_AFTER_MS)
    expect(await vb.set(40)).toBe('active')
    expect(path(ctx)).toEqual(FULL)
    expect(ctx.sources).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('varios videos (el panel remonta el <video>, el stage cambia de fuente)', () => {
  it('el mismo video se engancha UNA sola vez aunque se re-adjunte', async () => {
    const { vb, ctx } = setup()
    const v = video()
    await vb.attach(v)
    await vb.set(50)
    await vb.attach(null)
    await vb.attach(v)
    await vb.set(70)
    expect(ctx.sources).toHaveLength(1)
  })

  it('un video nuevo con la barra arriba se engancha solo, con el valor actual', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video())
    await vb.set(100)
    expect(await vb.attach(video())).toBe('active')
    expect(ctx.sources).toHaveLength(2)
    expect(chainOf(ctx, 1).voice.gain.value).toBe(VOICE_BOOST_MAX_DB.voice)
  })

  it('un video nuevo con la barra en 0 NO se engancha', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video())
    await vb.set(50)
    await vb.set(0)
    expect(await vb.attach(video())).toBe('off')
    expect(ctx.sources).toHaveLength(1)
  })
})

describe('sharedVoiceBoost', () => {
  it('uno solo por ventana, y crearlo no toca el audio', async () => {
    const { sharedVoiceBoost } = await import('@/lib/voiceBoost')
    const a = sharedVoiceBoost()
    expect(sharedVoiceBoost()).toBe(a)
    expect(a.amount).toBe(0)
  })
})
