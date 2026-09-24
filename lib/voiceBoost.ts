// "Voces más claras" — ecualizador que REALZA los diálogos sobre la música/ruido de
// fondo. Todo en el navegador (Web Audio), sin servidor y sin guardar nada.
//
// Cadena:  <video> → graves (lowshelf) → voz (peaking) → agudos (highshelf) → compensación → parlantes
//
// Reglas de seguridad del audio:
//   · Mientras la barra NUNCA se movió no se toca nada: el audio sale por el camino
//     nativo del navegador, idéntico bit a bit.
//   · REGLA DE ORO: el <video> se engancha a Web Audio SOLO si el AudioContext ya
//     está andando ('running'). Engancharlo con el contexto dormido lo dejaría mudo;
//     si no se puede, el audio sigue por el camino normal. Nunca silencio.
//   · Solo se enganchan <video> con crossOrigin="anonymous": un video de otro origen
//     sin CORS entregaría SILENCIO a Web Audio (verificado en vivo con un video de
//     Vercel Blob: sin crossOrigin, RMS 0).
//   · En 0 (después del primer uso) los filtros quedan FUERA del circuito:
//     video → parlantes directo. Un <video> enganchado no puede volver al camino
//     nativo (limitación del navegador), por eso "bit a bit" vale hasta el primer uso.
//   · El volumen del <video> sigue actuando después de engancharlo (verificado en
//     vivo: volume 0.25 → 0.261 del nivel).

export const VOICE_BOOST_MAX = 100

// Frecuencias de los tres filtros.
export const VOICE_BOOST_FREQS = {
  lowShelfHz: 250,  // debajo: graves de la música / ruido
  voiceHz: 2000,    // centro de la zona de inteligibilidad de la voz (~1–4 kHz)
  voiceQ: 0.8,
  highShelfHz: 6000, // arriba: platillos, siseo
} as const

// Cuánto hace cada banda con la barra al MÁXIMO (dB). En el medio, proporcional:
// los dB ya son una escala de oído, así que lineal en dB se siente parejo.
// Valores de arranque, a afinar de oído.
export const VOICE_BOOST_MAX_DB = {
  low: -10,
  voice: 6,
  high: -6,
  trim: -3, // compensación: que el volumen total no suba ni sature
} as const

export type VoiceBoostBands = { lowDb: number; voiceDb: number; highDb: number; trimDb: number }

export function clampVoiceBoost(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  return Math.min(VOICE_BOOST_MAX, Math.max(0, Math.round(amount)))
}

export function voiceBoostBands(amount: number): VoiceBoostBands {
  const k = clampVoiceBoost(amount) / VOICE_BOOST_MAX
  // `+ 0` convierte un -0 en 0 (0 * -10 da -0).
  return {
    lowDb: VOICE_BOOST_MAX_DB.low * k + 0,
    voiceDb: VOICE_BOOST_MAX_DB.voice * k + 0,
    highDb: VOICE_BOOST_MAX_DB.high * k + 0,
    trimDb: VOICE_BOOST_MAX_DB.trim * k + 0,
  }
}

export type VoiceBoostLabel = 'Apagado' | 'Suave' | 'Medio' | 'Fuerte'

export function voiceBoostLabel(amount: number): VoiceBoostLabel {
  const a = clampVoiceBoost(amount)
  if (a === 0) return 'Apagado'
  if (a <= 33) return 'Suave'
  if (a <= 66) return 'Medio'
  return 'Fuerte'
}

// 'off'         → barra en 0 (camino nativo, o filtros fuera del circuito).
// 'active'      → filtros aplicados.
// 'unavailable' → no se pudo enganchar (contexto dormido, sin Web Audio o video
//                 sin crossOrigin): el audio sigue por el camino normal.
export type VoiceBoostStatus = 'off' | 'active' | 'unavailable'

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
  bypassed: boolean
}

const dbToGain = (db: number) => Math.pow(10, db / 20)

export type VoiceBoostDeps = {
  createContext?: () => AudioContext
}

export type VoiceBoost = {
  /** El <video> que suena ahora en esta ventana (o null). Si la barra está arriba, lo engancha. */
  attach(video: HTMLMediaElement | null): Promise<VoiceBoostStatus>
  /**
   * Mueve la barra (0..100). Llamarlo DENTRO del evento del usuario (input/click):
   * la primera vez crea el AudioContext ahí, así el navegador lo deja arrancar.
   */
  set(amount: number): Promise<VoiceBoostStatus>
  readonly amount: number
}

export function createVoiceBoost(deps: VoiceBoostDeps = {}): VoiceBoost {
  const createContext = deps.createContext ?? (() => new AudioContext())
  let ctx: AudioContext | null = null
  let noWebAudio = false
  let amount = 0
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
    low.connect(voice)
    voice.connect(high)
    high.connect(trim)
    trim.connect(c.destination)
    // Arranca FUERA del circuito; route() lo mete si hace falta.
    source.connect(c.destination)
    return { source, low, voice, high, trim, bypassed: true }
  }

  function route(c: AudioContext, chain: Chain, bypass: boolean) {
    if (chain.bypassed === bypass) return
    chain.source.disconnect()
    chain.source.connect(bypass ? c.destination : chain.low)
    chain.bypassed = bypass
  }

  function applyBands(c: AudioContext, chain: Chain, a: number) {
    const b = voiceBoostBands(a)
    const t = c.currentTime
    chain.low.gain.setTargetAtTime(b.lowDb, t, RAMP_TIME_CONSTANT_S)
    chain.voice.gain.setTargetAtTime(b.voiceDb, t, RAMP_TIME_CONSTANT_S)
    chain.high.gain.setTargetAtTime(b.highDb, t, RAMP_TIME_CONSTANT_S)
    chain.trim.gain.setTargetAtTime(dbToGain(b.trimDb), t, RAMP_TIME_CONSTANT_S)
  }

  // Aplica `amount` al video actual. Nunca engancha con el contexto dormido.
  async function sync(): Promise<VoiceBoostStatus> {
    const el = video
    if (!el) return amount === 0 ? 'off' : 'unavailable'

    let chain = chains.get(el)
    if (!chain) {
      if (amount === 0) return 'off' // nunca usado con este video: camino nativo intacto
      if (el.crossOrigin !== 'anonymous') return 'unavailable'
      const c = ctx
      if (!c || !(await waitRunning(c))) return 'unavailable'
      if (video !== el) return sync() // cambió el video mientras esperábamos
      chain = chains.get(el) ?? build(c, el)
      chains.set(el, chain)
    }
    const c = ctx!
    if (bypassTimer) { clearTimeout(bypassTimer); bypassTimer = null }

    if (amount === 0) {
      // Bajar a 0 dB (identidad exacta para shelf/peaking) y, ya asentado, sacar
      // los filtros del circuito. Así el paso no hace "clic".
      applyBands(c, chain, 0)
      const ch = chain
      bypassTimer = setTimeout(() => {
        bypassTimer = null
        if (amount === 0) route(c, ch, true)
      }, BYPASS_AFTER_MS)
      return 'off'
    }
    route(c, chain, false) // entra en 0 dB (identidad), después sube suave
    applyBands(c, chain, amount)
    return c.state === 'running' ? 'active' : 'unavailable'
  }

  return {
    get amount() { return amount },
    attach(el) {
      video = el
      return sync()
    },
    set(next) {
      amount = clampVoiceBoost(next)
      if (amount > 0) wakeContext() // dentro del gesto
      return sync()
    },
  }
}

// UNO por ventana (panel o stage): un solo AudioContext y un solo registro de videos
// enganchados, aunque el componente de la barra se desmonte y se vuelva a montar.
// El valor de la barra vive acá mientras la página esté abierta (no se guarda).
let shared: VoiceBoost | null = null
export function sharedVoiceBoost(): VoiceBoost {
  return (shared ??= createVoiceBoost())
}
