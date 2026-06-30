// Typed BroadcastChannel wrapper for panel ↔ stage communication.
//
// Panel sends PanelCmd (play, pause, seek, speed, subtitle, load_blob, close).
// Stage sends StageEvent (ready, timeupdate, closed).
//
// Blob transfer (US-037): BroadcastChannel uses the structured clone algorithm,
// which natively supports Blob objects. The panel sends the raw File/Blob; the
// stage receives a clone and calls URL.createObjectURL() in its own document
// context, obtaining a valid object URL for its <video> element.

export type PanelCmd =
  | { type: 'load_blob'; blob: Blob; fileName: string; currentTime: number; playbackRate: number; ccOn: boolean }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; time: number }
  | { type: 'speed'; rate: number }
  | { type: 'subtitle'; text: string; visible: boolean }
  | { type: 'close' }

export type StageEvent =
  | { type: 'ready' }
  | { type: 'timeupdate'; currentTime: number; duration: number; isPlaying: boolean }
  | { type: 'closed' }

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
