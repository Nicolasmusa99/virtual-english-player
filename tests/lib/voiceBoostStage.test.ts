// "Voces más claras" — enlace panel → stage (lib/voiceBoostStage.ts).
// Lo central: el stage recibe el valor ACTUAL cuando se abre (aunque la barra esté
// desmontada), y su respuesta llega a quien esté escuchando.
import { describe, it, expect, afterEach } from 'vitest'
import { StageChannel, type ChannelMsg } from '@/lib/stageChannel'
import { createVoiceBoostStageLink } from '@/lib/voiceBoostStage'

const tick = () => new Promise<void>(r => setTimeout(r, 15))
const CH = 've-stage-voice-test'
const open: StageChannel[] = []
function chan() { const c = new StageChannel(CH); open.push(c); return c }
afterEach(() => { while (open.length) open.pop()!.close() })

function setup(amount = { v: 0 }) {
  const link = createVoiceBoostStageLink(() => amount.v, chan())
  const stage = chan()
  const atStage: ChannelMsg[] = []
  stage.onMessage(m => atStage.push(m))
  return { link, stage, atStage, amount }
}

describe('voiceBoostStage', () => {
  it('cuando el stage avisa "ready", le manda el valor ACTUAL de la barra', async () => {
    const { stage, atStage, amount } = setup({ v: 0 })
    amount.v = 65 // la barra se movió (quizás con el componente desmontado)
    stage.send({ type: 'ready' })
    await tick()
    expect(atStage).toEqual([{ type: 'voice_boost', amount: 65 }])
  })

  it('send() manda el valor al stage', async () => {
    const { link, atStage } = setup()
    link.send(30)
    await tick()
    expect(atStage).toEqual([{ type: 'voice_boost', amount: 30 }])
  })

  it('la respuesta del stage queda guardada y avisa a los suscriptos; al cerrarse vuelve a off', async () => {
    const { link, stage } = setup()
    const seen: string[] = []
    const unsub = link.subscribe(s => seen.push(s))
    expect(link.stageStatus).toBe('off')

    stage.send({ type: 'voice_boost_status', status: 'unavailable' })
    await tick()
    expect(link.stageStatus).toBe('unavailable')

    stage.send({ type: 'closed' })
    await tick()
    expect(link.stageStatus).toBe('off')
    expect(seen).toEqual(['unavailable', 'off'])

    unsub()
    stage.send({ type: 'voice_boost_status', status: 'active' })
    await tick()
    expect(seen).toEqual(['unavailable', 'off']) // desuscripto: no avisa más
    expect(link.stageStatus).toBe('active') // pero el estado sigue al día
  })
})
