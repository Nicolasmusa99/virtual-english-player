// Bloque 16 (US-055) — exercises generator window communication channel.
// Uses channel name 've-exercises-v1', separate from the stage channel ('ve-stage-v1').
//
// Player sends ExercisesCmd (load_phrases, close).
// Window sends ExercisesEvent (ready, closed).

export type ExercisesCmd =
  | { type: 'load_phrases'; phrases: string[]; level: string; fileName: string; scope: 'all' | 'sel' }
  | { type: 'close' }

export type ExercisesEvent =
  | { type: 'ready' }
  | { type: 'closed' }

export type ExercisesMsg = ExercisesCmd | ExercisesEvent

export const EXERCISES_CHANNEL_NAME = 've-exercises-v1'

export class ExercisesChannel {
  private ch: BroadcastChannel

  constructor(name = EXERCISES_CHANNEL_NAME) {
    this.ch = new BroadcastChannel(name)
  }

  send(msg: ExercisesMsg): void {
    this.ch.postMessage(msg)
  }

  onMessage(cb: (msg: ExercisesMsg) => void): () => void {
    const handler = (e: MessageEvent<ExercisesMsg>) => cb(e.data)
    this.ch.addEventListener('message', handler)
    return () => this.ch.removeEventListener('message', handler)
  }

  close(): void {
    this.ch.close()
  }
}
