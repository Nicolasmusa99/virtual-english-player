// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { FAKE_EXERCISES } from '../mocks/anthropic-handlers'

// ── SDK mock (vi.hoisted ensures the variable is defined before vi.mock is hoisted) ──────────
const mockCreate = vi.hoisted(() => vi.fn())

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function() {
    return { messages: { create: mockCreate } }
  }),
}))

// Import AFTER mock is set up
import { POST } from '@/app/api/exercises/route'

// ────────────────────────────────────────────────────────────────────────────────
const SAMPLE_PHRASES = [
  { text: 'Hello world, this is a test.' },
  { text: 'We are learning English today.' },
  { text: 'Practice makes perfect.' },
]

function makeReq(body: object): NextRequest {
  return new NextRequest('http://localhost/api/exercises', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

function toolUseResponse(input: object = FAKE_EXERCISES) {
  return {
    content: [{
      type:  'tool_use',
      id:    'toolu_test',
      name:  'build_exercises',
      input,
    }],
  }
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  mockCreate.mockResolvedValue(toolUseResponse())
})

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
  vi.clearAllMocks()
})

describe('POST /api/exercises', () => {
  it('(a) missing ANTHROPIC_API_KEY → 500 with clear message', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const res  = await POST(makeReq({ phrases: SAMPLE_PHRASES, level: 'intermediate', scope: 'all' }))
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data.error).toBe('API key not configured')
  })

  it('(b) empty phrases array → 400', async () => {
    const res  = await POST(makeReq({ phrases: [], level: 'intermediate', scope: 'all' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('No phrases provided')
  })

  it('(c) missing phrases key → 400', async () => {
    const res  = await POST(makeReq({ level: 'intermediate', scope: 'all' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('No phrases provided')
  })

  it('(d) happy path → 200 with validated exercise object from tool use', async () => {
    const res  = await POST(makeReq({ phrases: SAMPLE_PHRASES, level: 'intermediate', scope: 'all' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.quiz).toHaveLength(5)
    expect(data.cloze).toHaveLength(6)
    expect(data.match).toHaveLength(6)
    expect(data.quiz[0]).toMatchObject({
      question:    expect.any(String),
      options:     expect.arrayContaining([expect.any(String)]),
      correct:     expect.any(Number),
      explanation: expect.any(String),
    })
  })

  it('(e) tool_choice forces build_exercises — SDK is called with correct tool_choice param', async () => {
    await POST(makeReq({ phrases: SAMPLE_PHRASES, level: 'beginner', scope: 'all' }))
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.tool_choice).toEqual({ type: 'tool', name: 'build_exercises' })
    expect(callArgs.tools[0].name).toBe('build_exercises')
    expect(callArgs.model).toBe('claude-sonnet-4-6')
    expect(callArgs.max_tokens).toBe(4000)
  })

  it('(f) level is passed to the model prompt', async () => {
    await POST(makeReq({ phrases: SAMPLE_PHRASES, level: 'advanced', scope: 'all' }))
    const callArgs = mockCreate.mock.calls[0][0]
    const promptText: string = callArgs.messages[0].content as string
    expect(promptText.toLowerCase()).toContain('advanced')
  })

  it('(g) ANTHROPIC_API_KEY is used server-side — it reaches the SDK constructor, not the response body', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-secret-key'
    const res  = await POST(makeReq({ phrases: SAMPLE_PHRASES, level: 'intermediate', scope: 'all' }))
    const body = await res.text()
    // Key must NOT appear in the HTTP response
    expect(body).not.toContain('sk-ant-secret-key')
    // But it must have reached the Anthropic constructor
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    expect(vi.mocked(Anthropic)).toHaveBeenCalledWith({ apiKey: 'sk-ant-secret-key' })
  })

  it('(h) SDK error → 500 with error message, never crashes server', async () => {
    mockCreate.mockRejectedValue(new Error('overloaded'))
    const res  = await POST(makeReq({ phrases: SAMPLE_PHRASES, level: 'intermediate', scope: 'all' }))
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data.error).toBe('overloaded')
  })

  it('(i) response contains ONLY tool_use input — no extra parsing or JSON.parse on text', async () => {
    const customInput = { ...FAKE_EXERCISES, extra: 'preserved' }
    mockCreate.mockResolvedValue(toolUseResponse(customInput))
    const res  = await POST(makeReq({ phrases: SAMPLE_PHRASES, level: 'intermediate', scope: 'all' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.extra).toBe('preserved') // input passed through unmodified
  })

  it('(j) no tool_use block in response → 502 { error: "No structured output" }', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Sorry, I cannot help.' }] })
    const res  = await POST(makeReq({ phrases: SAMPLE_PHRASES, level: 'intermediate', scope: 'all' }))
    const data = await res.json()
    expect(res.status).toBe(502)
    expect(data.error).toBe('No structured output')
  })

  it('(k) malformed tool output — cloze item missing "___" → 502 { error: "Malformed exercise set" }', async () => {
    const bad = { ...FAKE_EXERCISES, cloze: [
      { sentence: 'No blank here at all.', answer: 'world' },
      ...FAKE_EXERCISES.cloze.slice(1),
    ]}
    mockCreate.mockResolvedValue(toolUseResponse(bad))
    const res  = await POST(makeReq({ phrases: SAMPLE_PHRASES, level: 'intermediate', scope: 'all' }))
    const data = await res.json()
    expect(res.status).toBe(502)
    expect(data.error).toBe('Malformed exercise set')
  })

  it('(l) malformed tool output — quiz correct out of [0-3] → 502 { error: "Malformed exercise set" }', async () => {
    const bad = { ...FAKE_EXERCISES, quiz: [
      { ...FAKE_EXERCISES.quiz[0], correct: 5 },
      ...FAKE_EXERCISES.quiz.slice(1),
    ]}
    mockCreate.mockResolvedValue(toolUseResponse(bad))
    const res  = await POST(makeReq({ phrases: SAMPLE_PHRASES, level: 'intermediate', scope: 'all' }))
    const data = await res.json()
    expect(res.status).toBe(502)
    expect(data.error).toBe('Malformed exercise set')
  })
})
