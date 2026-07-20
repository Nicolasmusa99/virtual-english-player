// @vitest-environment node
// Bloque 15 — TC-110 / TC-111 / route validation for new modes
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { FAKE_EXERCISES } from '../mocks/anthropic-handlers'

const mockCreate = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function() {
    return { messages: { create: mockCreate } }
  }),
}))

import { POST } from '@/app/api/exercises/route'

const SAMPLE_PHRASES = [
  { text: 'Hello world, this is a test.' },
  { text: 'We are learning English today.' },
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
      type: 'tool_use', id: 'toolu_test', name: 'build_exercises', input,
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

describe('POST /api/exercises — Bloque 15 modes', () => {
  // TC-110: mode=topic sends correct payload (no phrases passed to model)
  it('(b15-a) mode=topic → 200, SDK called with topic-focused prompt, no transcript section', async () => {
    const res  = await POST(makeReq({ mode: 'topic', topic: 'Second World War', level: 'intermediate' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    // verify prompt contains the topic
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt.toLowerCase()).toContain('second world war')
    // verify no TRANSCRIPT header in topic-only mode
    expect(prompt).not.toContain('TRANSCRIPT:')
  })

  // TC-111: mode=both → topic is focus, transcript is supporting context
  it('(b15-b) mode=both → SDK prompt contains TOPIC and TRANSCRIPT sections', async () => {
    const res = await POST(makeReq({
      mode: 'both', topic: 'World War II', phrases: SAMPLE_PHRASES, level: 'beginner',
    }))
    expect(res.status).toBe(200)
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('TOPIC')
    expect(prompt).toContain('World War II')
    expect(prompt).toContain('Hello world')
  })

  it('(b15-c) mode=topic with empty topic → 400 "No topic provided"', async () => {
    const res  = await POST(makeReq({ mode: 'topic', topic: '', level: 'intermediate' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('No topic provided')
  })

  it('(b15-d) mode=topic with whitespace-only topic → 400 "No topic provided"', async () => {
    const res  = await POST(makeReq({ mode: 'topic', topic: '   ', level: 'intermediate' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('No topic provided')
  })

  it('(b15-e) mode=both with empty topic → 400 "No topic provided"', async () => {
    const res  = await POST(makeReq({ mode: 'both', topic: '', phrases: SAMPLE_PHRASES, level: 'intermediate' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('No topic provided')
  })

  it('(b15-f) mode=both with empty phrases is allowed (topic is the axis)', async () => {
    const res = await POST(makeReq({ mode: 'both', topic: 'Grammar', phrases: [], level: 'intermediate' }))
    expect(res.status).toBe(200)
  })

  it('(b15-g) mode=video (explicit) still requires phrases — 400 without phrases', async () => {
    const res  = await POST(makeReq({ mode: 'video', phrases: [], level: 'intermediate' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('No phrases provided')
  })

  it('(b15-h) mode defaults to video when omitted — backward compat', async () => {
    const res = await POST(makeReq({ phrases: SAMPLE_PHRASES, level: 'intermediate' }))
    expect(res.status).toBe(200)
  })

  it('(b15-i) 502 malformed still works in topic mode', async () => {
    const bad = { ...FAKE_EXERCISES, quiz: [{ ...FAKE_EXERCISES.quiz[0], correct: 99 }, ...FAKE_EXERCISES.quiz.slice(1)] }
    mockCreate.mockResolvedValue(toolUseResponse(bad))
    const res  = await POST(makeReq({ mode: 'topic', topic: 'Grammar', level: 'intermediate' }))
    const data = await res.json()
    expect(res.status).toBe(502)
    expect(data.error).toBe('Malformed exercise set')
  })

  it('(b15-j) exercises_generation_started includes mode in SDK prompt call (mode is passed through)', async () => {
    await POST(makeReq({ mode: 'topic', topic: 'Idioms', level: 'advanced' }))
    const callArgs = mockCreate.mock.calls[0][0]
    // The prompt must mention the level
    expect(callArgs.messages[0].content.toLowerCase()).toContain('advanced')
  })
})
