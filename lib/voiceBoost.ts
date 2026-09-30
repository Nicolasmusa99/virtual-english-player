// "Sonido" (P2) — ecualizador de 3 bandas (Graves / Medios (voz) / Agudos) + limitador,
// para destacar los diálogos sobre la música/ruido de fondo. Todo en el navegador
// (Web Audio), sin servidor. El ajuste se recuerda en este navegador (loadEq/saveEq).
//
// Cadena:  <video> → graves (lowshelf) → voz (peaking) → agudos (highshelf)
//                  → compensación → limitador → parlantes
//
// Reglas de seguridad del audio:
//   · Mientras el ajuste NUNCA dejó de ser plano ("Original") no se toca nada: el audio
//     sale por el camino nativo del navegador, idéntico bit a bit.
//   · REGLA DE ORO: el <video> se engancha a Web Audio SOLO si el AudioContext ya
//     está andando ('running'). Engancharlo con el contexto dormido lo dejaría mudo;
//     si no se puede, el audio sigue por el camino normal. Nunca silencio.
//   · Solo se enganchan <video> con crossOrigin="anonymous": un video de otro origen
//     sin CORS entregaría SILENCIO a Web Audio (verificado en vivo con un video de
//     Vercel Blob: sin crossOrigin, RMS 0).
//   · En plano (después del primer uso) los filtros quedan FUERA del circuito:
//     video → parlantes directo. Un <video> enganchado no puede volver al camino
//     nativo (limitación del navegador), por eso "bit a bit" vale hasta el primer uso.
//   · El volumen del <video> sigue actuando después de engancharlo (verificado en
//     vivo: volume 0.25 → 0.261 del nivel).
//   · Un ajuste recordado (de otra vez) NO crea el AudioContext solo: queda 'pending'
//     hasta el primer gesto del usuario (el navegador no deja arrancar audio sin gesto).

// Dónde actúa cada banda. Los cortes están corridos hacia afuera (150 Hz y 7 kHz)
// para que un recorte fuerte no se coma la base de la voz (300 Hz–1 kHz): con el
// corte en 250 Hz, −20 dB dejaba 300 Hz en −11 dB (voz "de teléfono").
export const VOICE_BOOST_FREQS = {
  lowShelfHz: 150,   // Graves: música de abajo, golpes
  voiceHz: 2000,     // Medios: centro de la zona de inteligibilidad de la voz (~1–4 kHz)
  voiceQ: 0.7,       // ancho de la banda de voz (más chico = más ancho)
  highShelfHz: 7000, // Agudos: platillos, siseo
} as const

// Rango de cada barra (dB). 0 = sin cambio.
export const EQ_MIN_DB = -24
export const EQ_MAX_DB = 12

export type EqSetting = { low: number; mid: number; high: number }
export const EQ_FLAT: EqSetting = { low: 0, mid: 0, high: 0 }

// ═══════════════════════════════════════════════════════════════════════════
//  AJUSTES RÁPIDOS — se afinan de oído acá.
//  "Voces muy claras" ≈ la tabla "A" de antes (−20 / +2 / −14) pero con la voz en
//  +6: se puede gracias al limitador (antes +7 dB de voz daba 281 muestras saturadas).
// ═══════════════════════════════════════════════════════════════════════════
export const EQ_PRESETS = {
  original: EQ_FLAT,
  clear: { low: -10, mid: 3, high: -7 },
  veryClear: { low: -20, mid: 6, high: -14 },
} as const satisfies Record<string, EqSetting>
export type EqPreset = keyof typeof EQ_PRESETS
export const EQ_PRESET_ORDER: EqPreset[] = ['original', 'clear', 'veryClear']

// ═══════════════════════════════════════════════════════════════════════════
//  LIMITADOR + COMPENSACIÓN — medidos en Chrome (OfflineAudioContext) con el audio
//  real de un comercial mezclado fuerte (picos a −0,5 dBFS), 2026-09-30:
//    sin limitador: "Voces muy claras" 30 muestras saturadas, todo +12 → 371.
//    con esto:      0 saturadas en TODOS los casos (presets, cada banda en +12,
//                   todo en +12, todo en −24); pico máximo −0,3 dBFS.
//  Umbral −1 dB dejaba escapar hasta 21 muestras: por eso −4 y ataque 0.
//  El compresor del navegador suma algo de volumen propio (~+1 dB): no pasa de 0 dBFS.
// ═══════════════════════════════════════════════════════════════════════════
export const EQ_LIMITER = { thresholdDb: -4, kneeDb: 0, ratio: 20, attackS: 0, releaseS: 0.15 } as const
// Compensación: se baja todo la MITAD del mayor realce (el resto lo ataja el limitador).
export const EQ_TRIM_PER_BOOST = 0.5

const clampDb = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 0
  // `+ 0` convierte un -0 en 0.
  return Math.min(EQ_MAX_DB, Math.max(EQ_MIN_DB, Math.round(n))) + 0
}

// Acota a enteros dentro de [EQ_MIN_DB, EQ_MAX_DB]; lo que no es número → 0.
export function clampEq(s: unknown): EqSetting {
  const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
  return { low: clampDb(o.low), mid: clampDb(o.mid), high: clampDb(o.high) }
}

export const isFlat = (s: EqSetting) => s.low === 0 && s.mid === 0 && s.high === 0
export const sameEq = (a: EqSetting, b: EqSetting) => a.low === b.low && a.mid === b.mid && a.high === b.high

// Qué ajuste rápido es (o null = "Personalizado").
export function presetOf(s: EqSetting): EqPreset | null {
  return EQ_PRESET_ORDER.find(k => sameEq(EQ_PRESETS[k], s)) ?? null
}

export type VoiceBoostBands = { lowDb: number; voiceDb: number; highDb: number; trimDb: number }

export function eqBands(s: EqSetting): VoiceBoostBands {
  const e = clampEq(s)
  const boost = Math.max(0, e.low, e.mid, e.high)
  return { lowDb: e.low, voiceDb: e.mid, highDb: e.high, trimDb: -EQ_TRIM_PER_BOOST * boost + 0 }
}

// 'off'         → plano (camino nativo, o filtros fuera del circuito).
// 'active'      → filtros aplicados.
// 'pending'     → hay un ajuste recordado esperando el primer gesto del usuario.
// 'unavailable' → no se pudo enganchar (contexto dormido, sin Web Audio o video
//                 sin crossOrigin): el audio sigue por el camino normal.
export type VoiceBoostStatus = 'off' | 'active' | 'pending' | 'unavailable'

// Suavizado de los cambios (evita "clics" al mover la barra) y cuánto se espera,
// ya en 0 dB, antes de sacar los filtros del circuito.
export const RAMP_TIME_CONSTANT_S = 0.05
export const BYPASS_AFTER_MS = 300
// Cuánto se espera a que un contexto dormido arranque antes de rendirse.
export const RESUME_TIMEOUT_MS = 1000

type Chain = {
  source: MediaElementAudioSourceNode
  low: BiquadFilterNode
  voice: BiquadFilterNode
  high: BiquadFilterNode
  trim: GainNode
  limiter: DynamicsCompressorNode
  bypassed: boolean
}

const dbToGain = (db: number) => Math.pow(10, db / 20)

export type VoiceBoostDeps = {
  createContext?: () => AudioContext
  /** Ajuste con el que arranca (el recordado). No crea el AudioContext. */
  initial?: EqSetting
}

export type VoiceBoost = {
  /** El <video> que suena ahora en esta ventana (o null). Si hay ajuste, lo engancha. */
  attach(video: HTMLMediaElement | null): Promise<VoiceBoostStatus>
  /**
   * Cambia el ajuste. Llamarlo DENTRO del evento del usuario (input/click/tecla):
   * la primera vez crea el AudioContext ahí, así el navegador lo deja arrancar.
   */
  set(eq: EqSetting): Promise<VoiceBoostStatus>
  readonly eq: EqSetting
}

export function createVoiceBoost(deps: VoiceBoostDeps = {}): VoiceBoost {
  const createContext = deps.createContext ?? (() => new AudioContext())
  let ctx: AudioContext | null = null
  let noWebAudio = false
  let eq: EqSetting = clampEq(deps.initial ?? EQ_FLAT)
  let video: HTMLMediaElement | null = null
  let bypassTimer: ReturnType<typeof setTimeout> | null = null
  const chains = new WeakMap<HTMLMediaElement, Chain>()

  // Sincrónico a propósito: crear y despertar el contexto dentro del gesto del usuario.
  function wakeContext(): AudioContext | null {
    if (noWebAudio) return null
    if (!ctx) {
      try { ctx = createContext() } catch { noWebAudio = true; return null }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  }

  async function waitRunning(c: AudioContext): Promise<boolean> {
    if (c.state === 'running') return true
    if (c.state === 'closed') return false
    await Promise.race([
      c.resume().catch(() => {}),
      new Promise((r) => setTimeout(r, RESUME_TIMEOUT_MS)),
    ])
    // TS angosta `state` por el if de arriba, pero resume() lo cambia.
    return (c.state as AudioContextState) === 'running'
  }

  function build(c: AudioContext, el: HTMLMediaElement): Chain {
    const source = c.createMediaElementSource(el)
    const low = c.createBiquadFilter()
    low.type = 'lowshelf'
    low.frequency.value = VOICE_BOOST_FREQS.lowShelfHz
    low.gain.value = 0
    const voice = c.createBiquadFilter()
    voice.type = 'peaking'
    voice.frequency.value = VOICE_BOOST_FREQS.voiceHz
    voice.Q.value = VOICE_BOOST_FREQS.voiceQ
    voice.gain.value = 0
    const high = c.createBiquadFilter()
    high.type = 'highshelf'
    high.frequency.value = VOICE_BOOST_FREQS.highShelfHz
    high.gain.value = 0
    const trim = c.createGain()
    trim.gain.value = 1
    const limiter = c.createDynamicsCompressor()
    limiter.threshold.value = EQ_LIMITER.thresholdDb
    limiter.knee.value = EQ_LIMITER.kneeDb
    limiter.ratio.value = EQ_LIMITER.ratio
    limiter.attack.value = EQ_LIMITER.attackS
    limiter.release.value = EQ_LIMITER.releaseS
    low.connect(voice)
    voice.connect(high)
    high.connect(trim)
    trim.connect(limiter)
    limiter.connect(c.destination)
    // Arranca FUERA del circuito; route() lo mete si hace falta.
    source.connect(c.destination)
    return { source, low, voice, high, trim, limiter, bypassed: true }
  }

  function route(c: AudioContext, chain: Chain, bypass: boolean) {
    if (chain.bypassed === bypass) return
    chain.source.disconnect()
    chain.source.connect(bypass ? c.destination : chain.low)
    chain.bypassed = bypass
  }

  function applyBands(c: AudioContext, chain: Chain, s: EqSetting) {
    const b = eqBands(s)
    const t = c.currentTime
    chain.low.gain.setTargetAtTime(b.lowDb, t, RAMP_TIME_CONSTANT_S)
    chain.voice.gain.setTargetAtTime(b.voiceDb, t, RAMP_TIME_CONSTANT_S)
    chain.high.gain.setTargetAtTime(b.highDb, t, RAMP_TIME_CONSTANT_S)
    chain.trim.gain.setTargetAtTime(dbToGain(b.trimDb), t, RAMP_TIME_CONSTANT_S)
  }

  // Aplica `eq` al video actual. Nunca engancha con el contexto dormido.
  async function sync(): Promise<VoiceBoostStatus> {
    const el = video
    const flat = isFlat(eq)
    if (!el) return flat ? 'off' : (ctx ? 'unavailable' : 'pending')

    let chain = chains.get(el)
    if (!chain) {
      if (flat) return 'off' // nunca usado con este video: camino nativo intacto
      if (!ctx && !noWebAudio) return 'pending' // ajuste recordado: espera un gesto
      if (el.crossOrigin !== 'anonymous') return 'unavailable'
      const c = ctx
      if (!c || !(await waitRunning(c))) return 'unavailable'
      if (video !== el) return sync() // cambió el video mientras esperábamos
      chain = chains.get(el) ?? build(c, el)
      chains.set(el, chain)
    }
    const c = ctx!
    if (bypassTimer) { clearTimeout(bypassTimer); bypassTimer = null }

    if (isFlat(eq)) {
      // Bajar a 0 dB (identidad exacta para shelf/peaking) y, ya asentado, sacar
      // los filtros del circuito. Así el paso no hace "clic".
      applyBands(c, chain, EQ_FLAT)
      const ch = chain
      bypassTimer = setTimeout(() => {
        bypassTimer = null
        if (isFlat(eq)) route(c, ch, true)
      }, BYPASS_AFTER_MS)
      return 'off'
    }
    route(c, chain, false) // entra en 0 dB (identidad), después sube suave
    applyBands(c, chain, eq)
    return c.state === 'running' ? 'active' : 'unavailable'
  }

  return {
    get eq() { return eq },
    attach(el) {
      video = el
      return sync()
    },
    set(next) {
      eq = clampEq(next)
      if (!isFlat(eq)) wakeContext() // dentro del gesto
      return sync()
    },
  }
}

// ─── Recordar el ajuste (localStorage de este navegador) ────────────────────
// Si el almacenamiento no está (modo privado, bloqueado, servidor) o trae basura,
// se arranca en "Original". Nunca tira.
export const EQ_STORAGE_KEY = 've-eq-v1'
function localStore(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}
export function loadEq(storage: Storage | null = localStore()): EqSetting {
  try {
    const raw = storage?.getItem(EQ_STORAGE_KEY)
    return raw ? clampEq(JSON.parse(raw)) : EQ_FLAT
  } catch { return EQ_FLAT }
}
export function saveEq(eq: EqSetting, storage: Storage | null = localStore()): void {
  try {
    if (isFlat(eq)) storage?.removeItem(EQ_STORAGE_KEY)
    else storage?.setItem(EQ_STORAGE_KEY, JSON.stringify(clampEq(eq)))
  } catch { /* sin almacenamiento: no se recuerda, nada más */ }
}

// UNO por ventana (panel o stage): un solo AudioContext y un solo registro de videos
// enganchados, aunque el componente se desmonte y se vuelva a montar. Arranca con el
// ajuste recordado, sin tocar el audio hasta el primer gesto ('pending').
let shared: VoiceBoost | null = null
export function sharedVoiceBoost(): VoiceBoost {
  return (shared ??= createVoiceBoost({ initial: loadEq() }))
}
