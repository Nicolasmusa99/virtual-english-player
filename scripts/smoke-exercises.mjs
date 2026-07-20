// Smoke test: calls Anthropic API directly with the real key from .env.local
// Usage: npm run smoke:exercises
import Anthropic from '@anthropic-ai/sdk'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('❌  ANTHROPIC_API_KEY not set — run via: npm run smoke:exercises')
  process.exit(1)
}

const client = new Anthropic({ apiKey })

const PHRASES = [
  'The teacher explains the lesson clearly.',
  'Students practice every day to improve their English.',
  'Please repeat after me.',
  'Excuse me, could you speak more slowly?',
]

console.log('🔥  smoke: /api/exercises (real Anthropic API, intermediate)…')

const response = await client.messages.create({
  model:      'claude-sonnet-4-6',
  max_tokens: 4000,
  tools: [{
    name:        'build_exercises',
    description: 'Build interactive English exercises from a video transcript.',
    input_schema: {
      type: 'object',
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
    content: `You are an English teacher creating intermediate exercises.\n\nTRANSCRIPT:\n${PHRASES.join('\n')}\n\nGenerate intermediate-level exercises.`,
  }],
})

const toolUse = response.content.find(b => b.type === 'tool_use')
if (!toolUse || toolUse.type !== 'tool_use') {
  console.error('❌  No tool_use block in response')
  process.exit(1)
}

const { quiz, cloze, match } = toolUse.input
console.log(`   quiz:  ${quiz?.length} items`)
console.log(`   cloze: ${cloze?.length} items`)
console.log(`   match: ${match?.length} items`)

// Validate
if (!quiz?.length)  { console.error('❌  quiz empty');  process.exit(1) }
if (!cloze?.length) { console.error('❌  cloze empty'); process.exit(1) }
if (!match?.length) { console.error('❌  match empty'); process.exit(1) }

console.log('   quiz[0] keys:', Object.keys(quiz[0] ?? {}))
for (const q of quiz) {
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    console.error('❌  quiz item has wrong option count:', JSON.stringify(q))
    process.exit(1)
  }
  if (typeof q.correct !== 'number' || q.correct < 0 || q.correct > 3) {
    console.error('❌  quiz correct out of range:', q.correct, '— full item:', JSON.stringify(q))
    process.exit(1)
  }
}
for (const c of cloze) {
  if (!c.sentence?.includes('___')) {
    console.error('❌  cloze item missing "___":', c.sentence)
    process.exit(1)
  }
}

console.log('✅  smoke passed')
