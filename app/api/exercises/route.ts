// VE Drills (Bloque 14)
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

function validateSet(data: unknown): string | null {
  if (!data || typeof data !== 'object') return 'not an object'
  const d = data as Record<string, unknown>

  if (!Array.isArray(d.quiz) || d.quiz.length === 0) return 'quiz empty'
  for (const item of d.quiz) {
    if (!item || typeof item !== 'object') return 'quiz item invalid'
    const q = item as Record<string, unknown>
    if (!Array.isArray(q.options) || q.options.length !== 4) return 'options count'
    if (
      typeof q.correct !== 'number' ||
      !Number.isInteger(q.correct) ||
      q.correct < 0 ||
      q.correct > 3
    ) return 'correct out of range'
  }

  if (!Array.isArray(d.cloze) || d.cloze.length === 0) return 'cloze empty'
  for (const item of d.cloze) {
    if (!item || typeof item !== 'object') return 'cloze item invalid'
    const c = item as Record<string, unknown>
    if (typeof c.sentence !== 'string' || !c.sentence.includes('___')) return 'missing blank'
  }

  if (!Array.isArray(d.match) || d.match.length === 0) return 'match empty'

  return null
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

  try {
    const body             = await req.json()
    const { phrases, level } = body

    if (!phrases || phrases.length === 0)
      return NextResponse.json({ error: 'No phrases provided' }, { status: 400 })

    const client     = new Anthropic({ apiKey })
    const transcript = (phrases as { text: string }[]).map(p => p.text).join('\n')

    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4000,
      tools: [{
        name:        'build_exercises',
        description: 'Build interactive English exercises from a video transcript.',
        input_schema: {
          type: 'object' as const,
          properties: {
            quiz: {
              type: 'array',
              description: '5 multiple-choice questions',
              items: {
                type: 'object',
                properties: {
                  question:    { type: 'string' },
                  options:     { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
                  correct:     { type: 'integer', minimum: 0, maximum: 3 },
                  explanation: { type: 'string' },
                },
                required: ['question', 'options', 'correct', 'explanation'],
              },
              minItems: 5, maxItems: 5,
            },
            cloze: {
              type: 'array',
              description: '6 fill-in-the-blank sentences using "___" as placeholder',
              items: {
                type: 'object',
                properties: {
                  sentence: { type: 'string', description: 'Sentence with ___ for the blank' },
                  answer:   { type: 'string' },
                },
                required: ['sentence', 'answer'],
              },
              minItems: 6, maxItems: 6,
            },
            match: {
              type: 'array',
              description: '6 term-definition pairs',
              items: {
                type: 'object',
                properties: {
                  term:       { type: 'string' },
                  definition: { type: 'string' },
                },
                required: ['term', 'definition'],
              },
              minItems: 6, maxItems: 6,
            },
          },
          required: ['quiz', 'cloze', 'match'],
        },
      }],
      tool_choice: { type: 'tool', name: 'build_exercises' },
      messages: [{
        role:    'user',
        content: `You are an English language teacher creating exercises for ${level} students.
Use ONLY vocabulary and structures that appear in the transcript below. Do not introduce words or topics not present in the transcript. All exercise content must be in English.

TRANSCRIPT:
${transcript}

Generate ${level}-level exercises based exclusively on the transcript above.`,
      }],
    })

    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use')
      return NextResponse.json({ error: 'No structured output' }, { status: 502 })

    if (validateSet(toolUse.input))
      return NextResponse.json({ error: 'Malformed exercise set' }, { status: 502 })

    return NextResponse.json(toolUse.input)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[exercises]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
