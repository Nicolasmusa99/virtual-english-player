// Typed BroadcastChannel wrapper for panel ↔ stage communication.
//
// Panel sends PanelCmd (play, pause, seek, speed, subtitle, load_blob, close, voice_boost).
// Stage sends StageEvent (ready, timeupdate, closed, voice_boost_status).
//
// "Voces más claras" (lib/voiceBoost.ts): con el stage abierto el audio sale del
// <video> del STAGE, así que el ecualizador se aplica allá. El panel manda el valor
// de la barra (voice_boost) y el stage contesta si pudo aplicarlo (voice_boost_status).
//
// Blob transfer (US-037): BroadcastChannel uses the structured clone algorithm,
// which natively supports Blob objects. The panel sends the raw File/Blob; the
// stage receives a clone and calls URL.createObjectURL() in its own document
// context, obtaining a valid object URL for its <video> element.

import type { VoiceBoostStatus } from '@/lib/voiceBoost'

export type PanelCmd =
  | { type: 'load_blob'; blob: Blob; fileName: string; currentTime: number; playbackRate: number; ccOn: boolean }
  | { type: 'load_url';  url: string; fileName: string; currentTime: number; playbackRate: number; ccOn: boolean } // Fix stage + biblioteca
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; time: number }
  | { type: 'speed'; rate: number }
  | { type: 'subtitle'; text: string; visible: boolean }
  | { type: 'close' }
  | { type: 'voice_boost'; amount: number }

export type StageEvent =
  | { type: 'ready' }
  | { type: 'timeupdate'; currentTime: number; duration: number; isPlaying: boolean }
  | { type: 'closed' }
  | { type: 'voice_boost_status'; status: VoiceBoostStatus }

export type ChannelMsg = PanelCmd | StageEvent

export const CHANNEL_NAME = 've-stage-v1'

export class StageChannel {
  private ch: BroadcastChannel

  constructor(name = CHANNEL_NAME) {
    this.ch = new BroadcastChannel(name)
  }

  send(msg: ChannelMsg): void {
    this.ch.postMessage(msg)
  }

  onMessage(cb: (msg: ChannelMsg) => void): () => void {
    const handler = (e: MessageEvent<ChannelMsg>) => cb(e.data)
    this.ch.addEventListener('message', handler)
    return () => this.ch.removeEventListener('message', handler)
  }

  close(): void {
    this.ch.close()
  }
}
