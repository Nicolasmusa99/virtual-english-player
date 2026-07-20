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

const TOOL_SCHEMA = {
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
}

function validateResult(result, label) {
  const { quiz, cloze, match } = result
  console.log(`   quiz:  ${quiz?.length} items`)
  console.log(`   cloze: ${cloze?.length} items`)
  console.log(`   match: ${match?.length} items`)

  if (!quiz?.length)  { console.error(`❌  [${label}] quiz empty`);  return false }
  if (!cloze?.length) { console.error(`❌  [${label}] cloze empty`); return false }
  if (!match?.length) { console.error(`❌  [${label}] match empty`); return false }

  console.log(`   quiz[0] keys:`, Object.keys(quiz[0] ?? {}))
  for (const q of quiz) {
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      console.error(`❌  [${label}] quiz item has wrong option count:`, JSON.stringify(q))
      return false
    }
    if (typeof q.correct !== 'number' || q.correct < 0 || q.correct > 3) {
      console.error(`❌  [${label}] quiz correct out of range:`, q.correct)
      return false
    }
  }
  for (const c of cloze) {
    if (!c.sentence?.includes('___')) {
      console.error(`❌  [${label}] cloze item missing "___":`, c.sentence)
      return false
    }
  }
  return true
}

async function smokeVideo() {
  console.log('\n🔥  smoke: mode=video (intermediate)…')
  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 4000,
    tools:      [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'build_exercises' },
    messages: [{
      role:    'user',
      content: `You are an English language teacher creating exercises for intermediate students. All exercise content must be in English.
Use ONLY vocabulary and structures that appear in the transcript below. Do not introduce words or topics not present in the transcript.

TRANSCRIPT:
${PHRASES.join('\n')}

Generate intermediate-level exercises based exclusively on the transcript above.`,
    }],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    console.error('❌  No tool_use block in response')
    return false
  }
  return validateResult(toolUse.input, 'video')
}

async function smokeTopic() {
  console.log('\n🔥  smoke: mode=topic (beginner, topic="English greetings")…')
  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 4000,
    tools:      [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'build_exercises' },
    messages: [{
      role:    'user',
      content: `You are an English language teacher creating exercises for beginner students. All exercise content must be in English.
Generate beginner-level exercises about the following topic.

TOPIC: English greetings`,
    }],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    console.error('❌  No tool_use block in response')
    return false
  }
  return validateResult(toolUse.input, 'topic')
}

async function smokeBoth() {
  console.log('\n🔥  smoke: mode=both (advanced, topic="Classroom language")…')
  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 4000,
    tools:      [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'build_exercises' },
    messages: [{
      role:    'user',
      content: `You are an English language teacher creating exercises for advanced students. All exercise content must be in English.
Generate advanced-level exercises focused on the following topic. Use vocabulary and examples from the transcript if provided.

TOPIC: Classroom language

SUPPORTING TRANSCRIPT (use for vocabulary and examples):
${PHRASES.join('\n')}`,
    }],
  })

  const toolUse = response.content.find(b => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    console.error('❌  No tool_use block in response')
    return false
  }
  return validateResult(toolUse.input, 'both')
}

const results = await Promise.all([smokeVideo(), smokeTopic(), smokeBoth()])

if (results.every(Boolean)) {
  console.log('\n✅  all smoke tests passed (video, topic, both)')
} else {
  console.error('\n❌  one or more smoke tests failed')
  process.exit(1)
}
