import { describe, it, expect } from 'vitest'
import { StageChannel } from '@/lib/stageChannel'

// BroadcastChannel in jsdom delivers messages as macrotasks — 0 ms is non-deterministic
// under load; 10 ms is enough to flush without being slow.
function tick() { return new Promise<void>(resolve => setTimeout(resolve, 10)) }

// Unique channel name per test run to avoid cross-test interference
const CH = 've-stage-test'

function pair() {
  const a = new StageChannel(CH)
  const b = new StageChannel(CH)
  return { a, b, cleanup: () => { a.close(); b.close() } }
}

describe('StageChannel', () => {
  it('entrega un mensaje del emisor al receptor', async () => {
    const { a, b, cleanup } = pair()
    const received: unknown[] = []
    const unsub = b.onMessage(msg => received.push(msg))

    a.send({ type: 'play' })
    await tick()

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ type: 'play' })

    unsub(); cleanup()
  })

  it('el emisor NO recibe sus propios mensajes', async () => {
    const { a, cleanup } = pair()
    const selfReceived: unknown[] = []
    const unsub = a.onMessage(msg => selfReceived.push(msg))

    a.send({ type: 'pause' })
    await tick()

    expect(selfReceived).toHaveLength(0)

    unsub(); cleanup()
  })

  it('unsubscribe deja de recibir mensajes', async () => {
    const { a, b, cleanup } = pair()
    const received: unknown[] = []
    const unsub = b.onMessage(msg => received.push(msg))

    a.send({ type: 'play' })
    await tick()
    expect(received).toHaveLength(1)

    unsub()
    a.send({ type: 'pause' })
    await tick()
    expect(received).toHaveLength(1) // sin cambio

    cleanup()
  })

  it('entrega comando seek con payload numérico', async () => {
    const { a, b, cleanup } = pair()
    const received: unknown[] = []
    const unsub = b.onMessage(msg => received.push(msg))

    a.send({ type: 'seek', time: 42.5 })
    await tick()

    expect(received[0]).toEqual({ type: 'seek', time: 42.5 })

    unsub(); cleanup()
  })

  it('entrega timeupdate del stage al panel', async () => {
    const { a, b, cleanup } = pair()
    const received: unknown[] = []
    const unsub = a.onMessage(msg => received.push(msg))

    b.send({ type: 'timeupdate', currentTime: 10, duration: 120, isPlaying: true })
    await tick()

    expect(received[0]).toEqual({ type: 'timeupdate', currentTime: 10, duration: 120, isPlaying: true })

    unsub(); cleanup()
  })

  it('entrega load_blob con todos los campos del mensaje', async () => {
    // jsdom's BroadcastChannel doesn't structuredClone Blob objects properly
    // (Blob becomes {}). In real browsers, structured clone preserves Blob —
    // the stage calls URL.createObjectURL(blob) in its own document context.
    // This test verifies the message shape and scalar fields; Blob round-trip
    // is covered by manual/E2E testing in a real browser.
    const { a, b, cleanup } = pair()
    const received: unknown[] = []
    const unsub = b.onMessage(msg => received.push(msg))

    const blob = new Blob(['video data'], { type: 'video/mp4' })
    a.send({ type: 'load_blob', blob, fileName: 'test.mp4', currentTime: 3.5, playbackRate: 1.25, ccOn: false })
    await tick()

    const msg = received[0] as { type: string; fileName: string; currentTime: number; playbackRate: number; ccOn: boolean }
    expect(msg.type).toBe('load_blob')
    expect(msg.fileName).toBe('test.mp4')
    expect(msg.currentTime).toBe(3.5)
    expect(msg.playbackRate).toBe(1.25)
    expect(msg.ccOn).toBe(false)

    unsub(); cleanup()
  })

  it('entrega load_url con todos los campos del mensaje', async () => {
    const { a, b, cleanup } = pair()
    const received: unknown[] = []
    const unsub = b.onMessage(msg => received.push(msg))

    a.send({ type: 'load_url', url: 'https://cdn.example.com/vid.mp4', fileName: 'vid.mp4', currentTime: 5.0, playbackRate: 1.0, ccOn: true })
    await tick()

    const msg = received[0] as { type: string; url: string; fileName: string; currentTime: number; playbackRate: number; ccOn: boolean }
    expect(msg.type).toBe('load_url')
    expect(msg.url).toBe('https://cdn.example.com/vid.mp4')
    expect(msg.fileName).toBe('vid.mp4')
    expect(msg.currentTime).toBe(5.0)
    expect(msg.playbackRate).toBe(1.0)
    expect(msg.ccOn).toBe(true)

    unsub(); cleanup()
  })

  it('después de close() no se reciben más mensajes', async () => {
    const { a, b } = pair()
    const received: unknown[] = []
    b.onMessage(msg => received.push(msg))

    b.close()
    a.send({ type: 'play' })
    await tick()

    expect(received).toHaveLength(0)

    a.close()
  })
})
