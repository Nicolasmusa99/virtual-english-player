import { http, HttpResponse } from 'msw'
import type { ExerciseSet } from '@/lib/exercises'

export const FAKE_EXERCISES: ExerciseSet = {
  quiz: [
    { question: 'What is being discussed?',  options: ['Learning', 'Sports', 'Food', 'Travel'],    correct: 0, explanation: 'The transcript talks about learning.' },
    { question: 'Who is this for?',          options: ['Teachers', 'Students', 'Parents', 'Admins'], correct: 1, explanation: 'The material targets students.' },
    { question: 'Where does this happen?',   options: ['Office', 'School', 'Home', 'Park'],        correct: 2, explanation: 'It happens at home.' },
    { question: 'When is it practiced?',     options: ['Morning', 'Evening', 'Daily', 'Weekly'],   correct: 2, explanation: 'It is practiced daily.' },
    { question: 'How is it described?',      options: ['Difficult', 'Easy', 'Important', 'Fun'],   correct: 2, explanation: 'It is described as important.' },
  ],
  cloze: [
    { sentence: 'The ___ is great.',          answer: 'world'     },
    { sentence: 'She ___ every day.',          answer: 'practices' },
    { sentence: 'They ___ the lesson.',        answer: 'finished'  },
    { sentence: 'He ___ the door.',            answer: 'opened'    },
    { sentence: 'We ___ together.',            answer: 'worked'    },
    { sentence: 'It ___ perfectly.',           answer: 'worked'    },
  ],
  match: [
    { term: 'hello',     definition: 'a greeting'               },
    { term: 'goodbye',   definition: 'a farewell'               },
    { term: 'please',    definition: 'a polite request'         },
    { term: 'thank you', definition: 'an expression of gratitude' },
    { term: 'sorry',     definition: 'an apology'               },
    { term: 'excuse me', definition: 'to get attention'         },
  ],
}

export const anthropicHandlers = [
  http.post('https://api.anthropic.com/v1/messages', () =>
    HttpResponse.json({
      id:           'msg_test',
      type:         'message',
      role:         'assistant',
      content: [{
        type:  'tool_use',
        id:    'toolu_test',
        name:  'build_exercises',
        input: FAKE_EXERCISES,
      }],
      model:         'claude-sonnet-4-6',
      stop_reason:   'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 200 },
    })
  ),
]
