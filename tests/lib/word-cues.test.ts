// Subtítulos desde palabras con tiempo (lib/wordCues.ts) y la llamada a Deepgram
// (lib/groq.ts, con un fetch falso).
import { describe, it, expect, vi } from 'vitest'
import { cuesFromWords, cuesToSrt, fillGaps, END_PAD_SEC, LEAD_IN_SEC, WORD_CUE_MAX_CHARS, WORD_CUE_MAX_SEC, type TimedWord } from '@/lib/wordCues'
import { groqWords, GROQ_URL, GROQ_MODEL } from '@/lib/groq'
import { parseSRT } from '@/lib/srt'

// Palabras seguidas, 0,3 s cada una sin silencios, desde `t0`.
function say(text: string, t0 = 0, dur = 0.3, gap = 0.02): TimedWord[] {
  let t = t0
  return text.split(' ').map(w => { const o = { text: w, start: t, end: t + dur }; t += dur + gap; return o })
}

describe('cuesFromWords', () => {
  it('el bloque aparece apenas ANTES de su primera palabra y termina poco después de la última', () => {
    const ws = say('Hello there.', 1.234)
    const [c] = cuesFromWords(ws)
    expect(c.start).toBeCloseTo(1.234 - LEAD_IN_SEC, 3)
    expect(c.end).toBeCloseTo(ws[1].end + END_PAD_SEC, 3)
    expect(c.text).toBe('Hello there.')
  })

  it('corta en un silencio y no deja el bloque en pantalla durante el silencio', () => {
    const ws = [...say('I was walking home', 0), ...say('when it started raining', 5)]
    const cues = cuesFromWords(ws)
    expect(cues.map(c => c.text)).toEqual(['I was walking home', 'when it started raining'])
    expect(cues[0].end).toBeLessThan(2)
    expect(cues[1].start).toBeCloseTo(5 - LEAD_IN_SEC, 3)
  })

  it('corta al terminar cada oración', () => {
    const cues = cuesFromWords(say('This is the first sentence. And this is the second one.'))
    expect(cues.map(c => c.text)).toEqual(['This is the first sentence.', 'And this is the second one.'])
  })

  it('una oración cortita pegada a la siguiente va junta', () => {
    const cues = cuesFromWords(say('Okay. Let me show you the kitchen.'))
    expect(cues).toHaveLength(1)
  })

  it('ningún bloque pasa de 60 letras ni de 4,5 segundos, y corta en un buen lugar', () => {
    const long = 'So I told my brother that we should probably leave early because the traffic on the highway is always terrible on Friday afternoons, and he agreed with me'
    const cues = cuesFromWords(say(long))
    expect(cues.length).toBeGreaterThan(1)
    for (const c of cues) {
      expect(c.text.length).toBeLessThanOrEqual(WORD_CUE_MAX_CHARS)
      expect(c.end - c.start).toBeLessThanOrEqual(WORD_CUE_MAX_SEC + END_PAD_SEC + 1e-9)
      expect(c.text).not.toMatch(/\b(the|a|to|of)$/i)
    }
    expect(cues.map(c => c.text).join(' ')).toBe(long) // no se pierde ni se inventa nada
  })

  it('una pausa corta en el medio de la oración NO la parte (caso del narrador)', () => {
    const ws = [...say('This is the only world', 50), ...say('that the prisoners have ever known.', 52.4)]
    expect(cuesFromWords(ws).map(c => c.text)).toEqual(['This is the only world that the prisoners have ever known.'])
    const ws2 = [...say('And it is like nothing he', 95), ...say('could have ever imagined.', 97.9)]
    expect(cuesFromWords(ws2).map(c => c.text)).toEqual(['And it is like nothing he could have ever imagined.'])
  })

  it('una pausa larga sí corta, aunque la oración siga', () => {
    const ws = [...say('I was walking home', 0), ...say('when it started raining.', 4)]
    expect(cuesFromWords(ws)).toHaveLength(2)
  })

  it('el adelanto nunca se mete en la voz del bloque anterior', () => {
    const ws = [...say('First sentence here.', 0), ...say('Second one.', 1.36)]
    const cues = cuesFromWords(ws)
    expect(cues).toHaveLength(2)
    expect(cues[1].start).toBeGreaterThanOrEqual(ws[2].end)
    expect(cues[0].end).toBeLessThanOrEqual(cues[1].start)
  })

  it('cambio de persona que habla → bloque nuevo', () => {
    const ws = [...say('Are you coming', 0).map(w => ({ ...w, speaker: 0 })), ...say('yes I am', 1.1).map(w => ({ ...w, speaker: 1 }))]
    expect(cuesFromWords(ws).map(c => c.text)).toEqual(['Are you coming', 'yes I am'])
  })

  it('los bloques nunca se pisan', () => {
    const cues = cuesFromWords(say('One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two', 0, 0.3, 0))
    for (let i = 1; i < cues.length; i++) expect(cues[i - 1].end).toBeLessThanOrEqual(cues[i].start)
  })

  it('ignora palabras vacías o sin tiempo; sin palabras → sin bloques', () => {
    expect(cuesFromWords([])).toEqual([])
    expect(cuesFromWords([{ text: ' ', start: 0, end: 1 }, { text: 'x', start: NaN, end: 1 }])).toEqual([])
  })
})

describe('cuesToSrt', () => {
  it('arma un SRT que parseSRT lee igual', () => {
    const cues = cuesFromWords([...say('Hi.', 0), ...say('How are you?', 3)])
    const srt = cuesToSrt(cues)
    expect(srt.startsWith('1\n00:00:00,000 --> ')).toBe(true)
    const back = parseSRT(srt)
    expect(back.map(p => p.text)).toEqual(['Hi.', 'How are you?'])
    expect(back[1].start).toBeCloseTo(3 - LEAD_IN_SEC, 3)
    expect(cuesToSrt([])).toBe('')
  })
})

describe('groqWords', () => {
  it('le pasa la URL del video (no lo descarga), en inglés, con tiempos por palabra', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      words: [
        { word: 'Hello,', start: 0.5, end: 0.9 },
        { word: 'world.', start: 1, end: 1.4 },
        { word: '', start: 2, end: 2.1 },
      ],
    }), { status: 200 }))
    const ws = await groqWords('https://abc.public.blob.vercel-storage.com/v.mp4', 'KEY', fetchImpl as unknown as typeof fetch)
    expect(ws).toEqual([{ text: 'Hello,', start: 0.5, end: 0.9 }, { text: 'world.', start: 1, end: 1.4 }])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(GROQ_URL)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer KEY')
    const body = init.body as FormData
    expect(body.get('url')).toBe('https://abc.public.blob.vercel-storage.com/v.mp4')
    expect(body.get('model')).toBe(GROQ_MODEL)
    expect(body.get('language')).toBe('en')
    expect(body.getAll('timestamp_granularities[]')).toContain('word')
  })

  it('si las palabras vienen sin puntuación, toma el signo final de cada segmento', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      words: [
        { word: 'Hi', start: 0, end: 0.3 }, { word: 'there', start: 0.35, end: 0.7 },
        { word: 'how', start: 0.9, end: 1.1 }, { word: 'are', start: 1.12, end: 1.3 }, { word: 'you', start: 1.32, end: 1.6 },
      ],
      segments: [{ text: ' Hi there.', end: 0.7 }, { text: ' How are you?', end: 1.6 }],
    }), { status: 200 }))
    const ws = await groqWords('https://x', 'K', fetchImpl as unknown as typeof fetch)
    expect(ws.map(w => w.text)).toEqual(['Hi', 'there.', 'how', 'are', 'you?'])
  })

  it('con un archivo (el audio) lo manda como file, no como url', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ words: [{ word: 'Hi.', start: 0, end: 0.4 }] }), { status: 200 }))
    await groqWords(new Blob(['x'], { type: 'audio/mpeg' }), 'K', fetchImpl as unknown as typeof fetch)
    const body = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData
    expect(body.get('url')).toBeNull()
    expect((body.get('file') as File).name).toBe('audio.mp3')
  })

  it('si Groq contesta error, tira (la ruta sigue con Gemini)', async () => {
    const fetchImpl = vi.fn(async () => new Response('rate limit', { status: 429 }))
    await expect(groqWords('https://x', 'K', fetchImpl as unknown as typeof fetch)).rejects.toThrow(/429/)
  })
})

describe('fillGaps (lo que Whisper no escuchó lo completa Gemini)', () => {
  const W = [
    { start: 50, end: 53, text: 'This is the only world' },
    { start: 59, end: 62, text: 'that the prisoners have ever known.' },
    { start: 95, end: 98, text: 'And it is like nothing he' },
  ]
  it('agrega los bloques de Gemini que caen en un hueco de Whisper, recortados al hueco', () => {
    const G = [
      { start: 58.5, end: 62.5, text: 'that the prisoners have ever known.' }, // lo mismo: no entra
      { start: 64, end: 70, text: 'One day, a prisoner is set free.' },
      { start: 92, end: 95.8, text: 'He turns toward the light.' },          // pisa poco: entra recortado
    ]
    const { cues, added } = fillGaps(W, G)
    expect(added).toBe(2)
    expect(cues.map(c => c.text)).toEqual([
      'This is the only world', 'that the prisoners have ever known.',
      'One day, a prisoner is set free.', 'He turns toward the light.', 'And it is like nothing he',
    ])
    const turn = cues.find(c => c.text.startsWith('He turns'))!
    expect(turn.end).toBe(95)
    for (let i = 1; i < cues.length; i++) expect(cues[i - 1].end).toBeLessThanOrEqual(cues[i].start)
  })
  it('no duplica lo que Whisper ya tiene aunque Gemini lo ponga corrido de tiempo', () => {
    const { added } = fillGaps(W, [{ start: 63, end: 66, text: 'That the prisoners have ever known' }])
    expect(added).toBe(0)
  })
  it('sin bloques de Whisper, quedan todos los de Gemini', () => {
    const G = [{ start: 1, end: 2, text: 'Hi.' }, { start: 3, end: 4, text: 'Bye.' }]
    expect(fillGaps([], G).cues).toEqual(G)
  })
})

describe('subtítulos sobre música (2026-11-24)', () => {
  it('una primera palabra estirada hacia atrás por Whisper no adelanta el subtítulo', () => {
    // "Now" marcado de 10 a 13 s (en el audio dura 0,3 s, lo de antes es música)
    const ws = [{ text: 'Now,', start: 10, end: 13 }, ...say('imagine that a prisoner is released.', 13.05)]
    const [c] = cuesFromWords(ws)
    expect(c.start).toBeGreaterThan(12.2)
  })
  it('las palabras de largo normal no se tocan', () => {
    const [c] = cuesFromWords(say('Hello there.', 5))
    expect(c.start).toBeCloseTo(5 - LEAD_IN_SEC, 3)
  })
  it('Gemini no pone en un hueco de música una frase que Whisper ya escuchó cerca', () => {
    const W = [{ start: 74, end: 77, text: 'Now, imagine that a prisoner is released.' }]
    const { added } = fillGaps(W, [{ start: 66, end: 70, text: 'Now imagine that a prisoner is released' }])
    expect(added).toBe(0)
  })
})
