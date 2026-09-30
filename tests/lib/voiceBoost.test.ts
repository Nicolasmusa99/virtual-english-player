// "Sonido" (lib/voiceBoost.ts) — ajustes, bandas, recordar el ajuste y manejo de la
// cadena de Web Audio contra un AudioContext FALSO (jsdom no tiene Web Audio).
// Lo central: sin uso no se toca nada; REGLA DE ORO (nunca enganchar con el contexto
// dormido ni un video sin crossOrigin → nunca silencio); en plano los filtros salen
// del circuito; un video se engancha una sola vez; el ajuste recordado espera un gesto.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  BYPASS_AFTER_MS,
  RESUME_TIMEOUT_MS,
  VOICE_BOOST_FREQS,
  EQ_FLAT,
  EQ_LIMITER,
  EQ_MAX_DB,
  EQ_MIN_DB,
  EQ_PRESETS,
  EQ_PRESET_ORDER,
  EQ_STORAGE_KEY,
  EQ_TRIM_PER_BOOST,
  clampEq,
  createVoiceBoost,
  eqBands,
  isFlat,
  loadEq,
  presetOf,
  saveEq,
  type EqSetting,
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
class FakeCompressor extends FakeNode {
  threshold = new FakeParam()
  knee = new FakeParam()
  ratio = new FakeParam()
  attack = new FakeParam()
  release = new FakeParam()
  constructor() { super('compressor') }
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
  createDynamicsCompressor() { return new FakeCompressor() }
}

function video(cross: string | null = 'anonymous') {
  const v = document.createElement('video')
  if (cross !== null) v.crossOrigin = cross
  return v
}
function setup(ctx = new FakeCtx(), initial?: EqSetting) {
  const createContext = vi.fn(() => ctx as unknown as AudioContext)
  const vb = createVoiceBoost({ createContext, initial })
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
  const limiter = trim.outputs[0] as FakeCompressor
  return { low, voice, high, trim, limiter }
}
const FULL = ['source', 'lowshelf', 'peaking', 'highshelf', 'gain', 'compressor', 'destination']
const BYPASS = ['source', 'destination']
// Ajustes de prueba (lo único que importa es que no sean planos).
const A: EqSetting = { low: -10, mid: 3, high: -7 }
const B: EqSetting = { low: -5, mid: 0, high: -2 }
const BIG: EqSetting = { low: -20, mid: 6, high: -14 }

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

// ─────────────────────────────────────────────────────────────────────────────
describe('ajustes (clampEq / presetOf / eqBands)', () => {
  it('clampEq: enteros dentro de −24..+12; lo raro → 0; nunca -0', () => {
    expect(clampEq({ low: -30, mid: 20, high: 3.6 })).toEqual({ low: EQ_MIN_DB, mid: EQ_MAX_DB, high: 4 })
    expect(clampEq({ low: NaN, mid: 'x', high: Infinity })).toEqual(EQ_FLAT)
    expect(clampEq(null)).toEqual(EQ_FLAT)
    expect(clampEq('basura')).toEqual(EQ_FLAT)
    expect(clampEq({ low: '-5' })).toEqual({ low: -5, mid: 0, high: 0 })
    for (const v of Object.values(clampEq({ low: -0.2, mid: -0, high: 0 }))) expect(Object.is(v, 0)).toBe(true)
  })

  it('los ajustes rápidos: Original es plano; los de voz bajan graves/agudos y suben la voz', () => {
    expect(EQ_PRESET_ORDER).toEqual(['original', 'clear', 'veryClear'])
    expect(isFlat(EQ_PRESETS.original)).toBe(true)
    for (const k of ['clear', 'veryClear'] as const) {
      const p = EQ_PRESETS[k]
      expect(p.low).toBeLessThan(0)
      expect(p.high).toBeLessThan(0)
      expect(p.mid).toBeGreaterThan(0)
      expect(clampEq(p)).toEqual(p) // dentro del rango
    }
    // "muy claras" es más fuerte que "claras" en todo
    expect(EQ_PRESETS.veryClear.low).toBeLessThan(EQ_PRESETS.clear.low)
    expect(EQ_PRESETS.veryClear.high).toBeLessThan(EQ_PRESETS.clear.high)
    expect(EQ_PRESETS.veryClear.mid).toBeGreaterThan(EQ_PRESETS.clear.mid)
  })

  it('presetOf reconoce los ajustes rápidos; cualquier otro es null (Personalizado)', () => {
    for (const k of EQ_PRESET_ORDER) expect(presetOf({ ...EQ_PRESETS[k] })).toBe(k)
    expect(presetOf({ low: -10, mid: 3, high: -6 })).toBeNull()
  })

  it('eqBands: las 3 bandas tal cual y compensación = −la mitad del mayor realce', () => {
    expect(eqBands(EQ_FLAT)).toEqual({ lowDb: 0, voiceDb: 0, highDb: 0, trimDb: 0 })
    expect(eqBands({ low: -20, mid: -3, high: -14 }).trimDb).toBe(0) // solo cortes: sin compensación
    expect(eqBands(BIG)).toEqual({ lowDb: -20, voiceDb: 6, highDb: -14, trimDb: -EQ_TRIM_PER_BOOST * 6 })
    expect(eqBands({ low: 12, mid: 4, high: 12 }).trimDb).toBe(-EQ_TRIM_PER_BOOST * 12)
    expect(eqBands({ low: 99, mid: 0, high: 0 }).lowDb).toBe(EQ_MAX_DB) // acota
  })

  it('las bandas no invaden la voz: graves < 300 Hz, agudos > 4 kHz', () => {
    expect(VOICE_BOOST_FREQS.lowShelfHz).toBeLessThan(300)
    expect(VOICE_BOOST_FREQS.highShelfHz).toBeGreaterThan(4000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('recordar el ajuste (loadEq / saveEq)', () => {
  function mem(): Storage {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, v) },
      removeItem: (k: string) => { m.delete(k) },
      clear: () => m.clear(),
      key: () => null,
      get length() { return m.size },
    } as Storage
  }
  it('guarda y vuelve a leer el mismo ajuste', () => {
    const st = mem()
    saveEq(A, st)
    expect(loadEq(st)).toEqual(A)
  })
  it('Original no se guarda (borra lo anterior)', () => {
    const st = mem()
    saveEq(A, st)
    saveEq(EQ_FLAT, st)
    expect(st.getItem(EQ_STORAGE_KEY)).toBeNull()
    expect(loadEq(st)).toEqual(EQ_FLAT)
  })
  it('basura o valores fuera de rango → se acotan o vuelve Original', () => {
    const st = mem()
    st.setItem(EQ_STORAGE_KEY, '{no es json')
    expect(loadEq(st)).toEqual(EQ_FLAT)
    st.setItem(EQ_STORAGE_KEY, JSON.stringify({ low: -99, mid: 50, high: 'x' }))
    expect(loadEq(st)).toEqual({ low: EQ_MIN_DB, mid: EQ_MAX_DB, high: 0 })
  })
  it('sin almacenamiento o si tira (modo privado): no rompe', () => {
    expect(loadEq(null)).toEqual(EQ_FLAT)
    const broken = {
      getItem() { throw new Error('bloqueado') },
      setItem() { throw new Error('bloqueado') },
      removeItem() { throw new Error('bloqueado') },
    } as unknown as Storage
    expect(loadEq(broken)).toEqual(EQ_FLAT)
    expect(() => saveEq(A, broken)).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Curva de los filtros calculada con las MISMAS fórmulas que usa el navegador para
// BiquadFilterNode (spec de Web Audio; verificado contra Chrome el 2026-09-28:
// coincide al 0,1 dB en 14 frecuencias). La saturación NO se controla acá: la ataja
// el limitador (medido en Chrome con audio real, 0 muestras saturadas con cualquier
// ajuste; ver EQ_LIMITER).
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
function curveDb(eq: EqSetting, fs: number) {
  const bands = eqBands(eq)
  const F = VOICE_BOOST_FREQS
  const filters = [
    biquadDb('lowshelf', F.lowShelfHz, bands.lowDb, 0, fs),
    biquadDb('peaking', F.voiceHz, bands.voiceDb, F.voiceQ, fs),
    biquadDb('highshelf', F.highShelfHz, bands.highDb, 0, fs),
  ]
  return (hz: number) => filters.reduce((acc, f) => acc + f(hz), 0) + bands.trimDb
}
const AUDIBLE = Array.from({ length: 500 }, (_, i) => 20 * Math.pow(1000, i / 499)) // 20 Hz–20 kHz

describe('curvas de los ajustes rápidos', () => {
  it('Original: curva plana exacta en todo el rango', () => {
    const c = curveDb(EQ_FLAT, 48000)
    for (const hz of AUDIBLE) expect(Math.abs(c(hz))).toBeLessThan(1e-9)
  })

  it('la voz se destaca: el fondo (100 Hz y 12 kHz) queda debajo de la voz (1–2 kHz)', () => {
    for (const [k, min] of [['clear', 7], ['veryClear', 15]] as const) {
      const c = curveDb(EQ_PRESETS[k], 48000)
      const voz = Math.min(c(1000), c(2000))
      expect(voz - c(100), k + ' graves').toBeGreaterThanOrEqual(min)
      expect(voz - c(12000), k + ' agudos').toBeGreaterThanOrEqual(min)
    }
  })

  it('la base de la voz (300 Hz) no se hunde demasiado (voz "de teléfono")', () => {
    const c = curveDb(EQ_PRESETS.veryClear, 48000)
    expect(c(300) - c(2000)).toBeGreaterThan(-12)
  })

  it('el limitador es un limitador de verdad: umbral bajo 0 dBFS, relación alta, ataque inmediato', () => {
    expect(EQ_LIMITER.thresholdDb).toBeLessThan(0)
    expect(EQ_LIMITER.ratio).toBeGreaterThanOrEqual(10)
    expect(EQ_LIMITER.attackS).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('sin uso no se toca nada (camino nativo, bit a bit)', () => {
  it('attach + Original → no crea AudioContext ni engancha el video', async () => {
    const { vb, createContext, ctx } = setup()
    expect(await vb.attach(video())).toBe('off')
    expect(await vb.set(EQ_FLAT)).toBe('off')
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
    expect(await vb.set(A)).toBe('active')
    await vb.set(B)
    expect(createContext).toHaveBeenCalledTimes(1)
    expect(ctx.sources).toHaveLength(1)
    expect(path(ctx)).toEqual(FULL)
  })

  it('el contexto se crea SINCRÓNICAMENTE dentro de set() (antes de cualquier await)', () => {
    const { vb, createContext } = setup()
    void vb.set(A) // sin await: tiene que haberse creado ya
    expect(createContext).toHaveBeenCalledTimes(1)
  })

  it('filtros y limitador configurados (VOICE_BOOST_FREQS / EQ_LIMITER) y las bandas del ajuste', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video())
    await vb.set(BIG)
    const { low, voice, high, trim, limiter } = chainOf(ctx)
    const F = VOICE_BOOST_FREQS, L = EQ_LIMITER
    expect([low.type, low.frequency.value]).toEqual(['lowshelf', F.lowShelfHz])
    expect([voice.type, voice.frequency.value, voice.Q.value]).toEqual(['peaking', F.voiceHz, F.voiceQ])
    expect([high.type, high.frequency.value]).toEqual(['highshelf', F.highShelfHz])
    expect([low.gain.value, voice.gain.value, high.gain.value]).toEqual([BIG.low, BIG.mid, BIG.high])
    expect(trim.gain.value).toBeCloseTo(Math.pow(10, eqBands(BIG).trimDb / 20), 10)
    expect([limiter.threshold.value, limiter.knee.value, limiter.ratio.value, limiter.attack.value, limiter.release.value])
      .toEqual([L.thresholdDb, L.kneeDb, L.ratio, L.attackS, L.releaseS])
  })

  it('los cambios van suavizados (setTargetAtTime desde el tiempo actual, sin saltos)', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video())
    await vb.set(A)
    const { voice } = chainOf(ctx)
    expect(voice.gain.targets.at(-1)).toEqual([A.mid, 12.5, 0.05])
  })

  it('set antes de attach: engancha al llegar el video', async () => {
    const { vb, ctx } = setup()
    expect(await vb.set(A)).toBe('unavailable') // todavía no hay video
    expect(await vb.attach(video())).toBe('active')
    expect(path(ctx)).toEqual(FULL)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('ajuste recordado: espera un gesto', () => {
  it('arranca con el ajuste recordado SIN crear el AudioContext → pending, video sin enganchar', async () => {
    const { vb, createContext, ctx } = setup(new FakeCtx(), A)
    expect(vb.eq).toEqual(A)
    expect(await vb.attach(video())).toBe('pending')
    expect(createContext).not.toHaveBeenCalled()
    expect(ctx.sources).toHaveLength(0)
  })

  it('con el gesto (set del mismo ajuste) crea el contexto y engancha', async () => {
    const { vb, ctx } = setup(new FakeCtx(), A)
    await vb.attach(video())
    expect(await vb.set(vb.eq)).toBe('active')
    expect(path(ctx)).toEqual(FULL)
    expect(chainOf(ctx).voice.gain.value).toBe(A.mid)
  })

  it('recordado Original → como si nada (off)', async () => {
    const { vb, createContext } = setup(new FakeCtx(), EQ_FLAT)
    expect(await vb.attach(video())).toBe('off')
    expect(createContext).not.toHaveBeenCalled()
  })

  it('un recordado fuera de rango se acota', () => {
    const { vb } = setup(new FakeCtx(), { low: -99, mid: 40, high: 0 })
    expect(vb.eq).toEqual({ low: EQ_MIN_DB, mid: EQ_MAX_DB, high: 0 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('REGLA DE ORO: si no se puede enganchar, camino normal (nunca silencio)', () => {
  it('contexto dormido que no arranca → unavailable y el video NO se engancha', async () => {
    const { vb, ctx } = setup(new FakeCtx('suspended', 'stay'))
    await vb.attach(video())
    const p = vb.set(A)
    await vi.advanceTimersByTimeAsync(RESUME_TIMEOUT_MS)
    expect(await p).toBe('unavailable')
    expect(ctx.sources).toHaveLength(0)
  })

  it('resume() que nunca responde → se rinde al tiempo límite, sin enganchar', async () => {
    const { vb, ctx } = setup(new FakeCtx('suspended', 'hang'))
    await vb.attach(video())
    const p = vb.set(A)
    await vi.advanceTimersByTimeAsync(RESUME_TIMEOUT_MS)
    expect(await p).toBe('unavailable')
    expect(ctx.sources).toHaveLength(0)
  })

  it('contexto dormido que arranca con resume() → engancha', async () => {
    const { vb, ctx } = setup(new FakeCtx('suspended', 'run'))
    await vb.attach(video())
    expect(await vb.set(A)).toBe('active')
    expect(ctx.resumeCalls).toBeGreaterThan(0)
    expect(ctx.sources).toHaveLength(1)
  })

  it('después de un unavailable, un nuevo set (p. ej. un clic) reintenta y engancha', async () => {
    const ctx = new FakeCtx('suspended', 'stay')
    const { vb } = setup(ctx)
    await vb.attach(video())
    const p = vb.set(A)
    await vi.advanceTimersByTimeAsync(RESUME_TIMEOUT_MS)
    expect(await p).toBe('unavailable')
    ctx.onResume = 'run' // ahora hay gesto
    expect(await vb.set(A)).toBe('active')
    expect(ctx.sources).toHaveLength(1)
  })

  it('video SIN crossOrigin → unavailable y NO se engancha (daría silencio con videos de otro origen)', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video(null))
    expect(await vb.set(A)).toBe('unavailable')
    expect(ctx.sources).toHaveLength(0)
  })

  it('navegador sin Web Audio (el constructor tira) → unavailable, sin romper, y no reintenta crear', async () => {
    const createContext = vi.fn(() => { throw new Error('no Web Audio') })
    const vb = createVoiceBoost({ createContext })
    await vb.attach(video())
    expect(await vb.set(A)).toBe('unavailable')
    expect(await vb.set(B)).toBe('unavailable')
    expect(createContext).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('volver a Original', () => {
  it('baja a 0 dB y, ya asentado, saca los filtros del circuito (video → parlantes directo)', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video())
    await vb.set(BIG)
    const { low, voice, high, trim } = chainOf(ctx)
    expect(await vb.set(EQ_FLAT)).toBe('off')
    expect([low.gain.value, voice.gain.value, high.gain.value, trim.gain.value]).toEqual([0, 0, 0, 1])
    expect(path(ctx)).toEqual(FULL) // todavía adentro mientras baja
    await vi.advanceTimersByTimeAsync(BYPASS_AFTER_MS)
    expect(path(ctx)).toEqual(BYPASS)
  })

  it('si se vuelve a cambiar antes de que se saquen los filtros, se quedan adentro', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video())
    await vb.set(BIG)
    await vb.set(EQ_FLAT)
    await vi.advanceTimersByTimeAsync(BYPASS_AFTER_MS / 2)
    await vb.set(B)
    await vi.advanceTimersByTimeAsync(BYPASS_AFTER_MS * 2)
    expect(path(ctx)).toEqual(FULL)
  })

  it('cambiar otra vez desde Original vuelve a meter los filtros, sin re-enganchar el video', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video())
    await vb.set(BIG)
    await vb.set(EQ_FLAT)
    await vi.advanceTimersByTimeAsync(BYPASS_AFTER_MS)
    expect(await vb.set(A)).toBe('active')
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
    await vb.set(A)
    await vb.attach(null)
    await vb.attach(v)
    await vb.set(B)
    expect(ctx.sources).toHaveLength(1)
  })

  it('un video nuevo con ajuste se engancha solo, con el ajuste actual', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video())
    await vb.set(BIG)
    expect(await vb.attach(video())).toBe('active')
    expect(ctx.sources).toHaveLength(2)
    expect(chainOf(ctx, 1).voice.gain.value).toBe(BIG.mid)
  })

  it('un video nuevo en Original NO se engancha', async () => {
    const { vb, ctx } = setup()
    await vb.attach(video())
    await vb.set(A)
    await vb.set(EQ_FLAT)
    expect(await vb.attach(video())).toBe('off')
    expect(ctx.sources).toHaveLength(1)
  })
})

describe('sharedVoiceBoost', () => {
  it('uno solo por ventana, arranca con el ajuste recordado y crearlo no toca el audio', async () => {
    localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify(A))
    vi.resetModules()
    const { sharedVoiceBoost } = await import('@/lib/voiceBoost')
    const a = sharedVoiceBoost()
    expect(sharedVoiceBoost()).toBe(a)
    expect(a.eq).toEqual(A)
    localStorage.removeItem(EQ_STORAGE_KEY)
  })
})
