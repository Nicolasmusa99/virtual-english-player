// "Voces más claras" — enlace panel → stage. UNO por ventana del panel y vivo
// mientras la página esté abierta.
//
// Vive acá y no en el componente de la barra porque la barra se DESMONTA al pasar a
// la pestaña Ejercicios: si el stage se abre en ese momento, igual tiene que recibir
// el valor actual (lo pide mandando 'ready') y su respuesta no se tiene que perder.
//
// Crearlo abre un BroadcastChannel: llamar a sharedVoiceBoostStageLink() solo en el
// navegador (efectos / handlers), nunca durante el render del servidor.
import { StageChannel } from '@/lib/stageChannel'
import { sharedVoiceBoost, type VoiceBoostStatus } from '@/lib/voiceBoost'

export type VoiceBoostStageLink = {
  /** Manda el valor de la barra al stage (si no hay stage abierto, no pasa nada). */
  send(amount: number): void
  /** Lo último que contestó el stage ('off' si no hay stage o se cerró). */
  readonly stageStatus: VoiceBoostStatus
  subscribe(cb: (status: VoiceBoostStatus) => void): () => void
}

export function createVoiceBoostStageLink(
  getAmount: () => number,
  ch: StageChannel = new StageChannel(),
): VoiceBoostStageLink {
  let status: VoiceBoostStatus = 'off'
  const subs = new Set<(s: VoiceBoostStatus) => void>()
  const setStatus = (s: VoiceBoostStatus) => {
    status = s
    subs.forEach(cb => cb(s))
  }

  ch.onMessage(msg => {
    if (msg.type === 'ready') ch.send({ type: 'voice_boost', amount: getAmount() })
    else if (msg.type === 'voice_boost_status') setStatus(msg.status)
    else if (msg.type === 'closed') setStatus('off')
  })

  return {
    send(amount) { ch.send({ type: 'voice_boost', amount }) },
    get stageStatus() { return status },
    subscribe(cb) {
      subs.add(cb)
      return () => { subs.delete(cb) }
    },
  }
}

let shared: VoiceBoostStageLink | null = null
export function sharedVoiceBoostStageLink(): VoiceBoostStageLink {
  return (shared ??= createVoiceBoostStageLink(() => sharedVoiceBoost().amount))
}
