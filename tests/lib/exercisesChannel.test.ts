import { describe, it, expect } from 'vitest'
import { ExercisesChannel } from '@/lib/exercisesChannel'

// BroadcastChannel in jsdom delivers messages as macrotasks; 10 ms is enough to flush.
function tick() { return new Promise<void>(resolve => setTimeout(resolve, 10)) }

const CH = 've-exercises-test'

function pair() {
  const a = new ExercisesChannel(CH)
  const b = new ExercisesChannel(CH)
  return { a, b, cleanup: () => { a.close(); b.close() } }
}

describe('ExercisesChannel', () => {
  it('entrega un mensaje del emisor al receptor', async () => {
    const { a, b, cleanup } = pair()
    const received: unknown[] = []
    const unsub = b.onMessage(msg => received.push(msg))

    a.send({ type: 'ready' })
    await tick()

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ type: 'ready' })

    unsub(); cleanup()
  })

  it('el emisor NO recibe sus propios mensajes', async () => {
    const { a, cleanup } = pair()
    const selfReceived: unknown[] = []
    const unsub = a.onMessage(msg => selfReceived.push(msg))

    a.send({ type: 'closed' })
    await tick()

    expect(selfReceived).toHaveLength(0)

    unsub(); cleanup()
  })

  it('unsubscribe deja de recibir mensajes', async () => {
    const { a, b, cleanup } = pair()
    const received: unknown[] = []
    const unsub = b.onMessage(msg => received.push(msg))

    a.send({ type: 'ready' })
    await tick()
    expect(received).toHaveLength(1)

    unsub()
    a.send({ type: 'closed' })
    await tick()
    expect(received).toHaveLength(1) // sin cambio

    cleanup()
  })

  it('entrega load_phrases con todos los campos', async () => {
    const { a, b, cleanup } = pair()
    const received: unknown[] = []
    const unsub = b.onMessage(msg => received.push(msg))

    a.send({ type: 'load_phrases', phrases: ['Hello world', 'How are you'], level: 'intermediate', fileName: 'test.mp4', scope: 'all' })
    await tick()

    expect(received[0]).toEqual({
      type: 'load_phrases',
      phrases: ['Hello world', 'How are you'],
      level: 'intermediate',
      fileName: 'test.mp4',
      scope: 'all',
    })

    unsub(); cleanup()
  })

  it('entrega comando close', async () => {
    const { a, b, cleanup } = pair()
    const received: unknown[] = []
    const unsub = b.onMessage(msg => received.push(msg))

    a.send({ type: 'close' })
    await tick()

    expect(received[0]).toEqual({ type: 'close' })

    unsub(); cleanup()
  })

  it('después de close() no se reciben más mensajes', async () => {
    const { a, b } = pair()
    const received: unknown[] = []
    b.onMessage(msg => received.push(msg))

    b.close()
    a.send({ type: 'ready' })
    await tick()

    expect(received).toHaveLength(0)

    a.close()
  })
})
