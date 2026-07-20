// VE Drills (Bloque 14)
'use client'
import { useEffect, useState } from 'react'
import type { Phrase } from '@/lib/srt'
import type { Level, Scope, GenState, ExerciseSet, MatchItem } from '@/lib/exercises'
import { resolveScope } from '@/lib/exercises'
import { capture } from '@/lib/capture'

interface Props {
  phrases: Phrase[]
  videoFileName: string
}

type DrillTab = 'quiz' | 'cloze' | 'match'

export default function ExercisesPanel({ phrases, videoFileName }: Props) {
  const [level, setLevel]         = useState<Level>('intermediate')
  const [scope, setScope]         = useState<Scope>('all')
  const [genState, setGenState]   = useState<GenState>('idle')
  const [exercises, setExercises] = useState<ExerciseSet | null>(null)
  const [errorMsg, setErrorMsg]   = useState('')
  const [drillTab, setDrillTab]   = useState<DrillTab>('quiz')

  const [quizAnswers, setQuizAnswers]       = useState<(number | null)[]>([])
  const [clozeInputs, setClozeInputs]       = useState<string[]>([])
  const [clozeSubmitted, setClozeSubmitted] = useState<boolean[]>([])

  const [shuffledDefs, setShuffledDefs]     = useState<number[]>([])
  const [matchedPairs, setMatchedPairs]     = useState<Set<number>>(new Set())
  const [selectedTerm, setSelectedTerm]     = useState<number | null>(null)
  const [wrongTermFlash, setWrongTermFlash] = useState<number | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    capture('exercises_tab_opened', {
      video_file_name: videoFileName,
      selected_count:  phrases.filter(p => p.sel).length,
    })
  }, [])

  async function generate() {
    const sourcePhrases = resolveScope(phrases, scope)
    const startMs = Date.now()
    capture('exercises_generation_started', {
      level,
      scope,
      phrase_count:    sourcePhrases.length,
      video_file_name: videoFileName,
    })
    setGenState('generating')
    setErrorMsg('')

    let httpStatus = 0
    try {
      const res = await fetch('/api/exercises', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phrases: sourcePhrases, level, scope }),
      })
      httpStatus = res.status
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      const ex: ExerciseSet = data

      const idx = ex.match.map((_: MatchItem, i: number) => i)
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]]
      }

      setExercises(ex)
      setQuizAnswers(ex.quiz.map(() => null))
      setClozeInputs(ex.cloze.map(() => ''))
      setClozeSubmitted(ex.cloze.map(() => false))
      setShuffledDefs(idx)
      setMatchedPairs(new Set())
      setSelectedTerm(null)
      setWrongTermFlash(null)
      setDrillTab('quiz')
      capture('exercises_generated', {
        quiz_count:  ex.quiz.length,
        cloze_count: ex.cloze.length,
        match_count: ex.match.length,
        duration_ms: Date.now() - startMs,
        level, scope,
      })
      setGenState('ready')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      capture('exercises_generation_failed', { http_status: httpStatus, error: msg, level, scope })
      setErrorMsg(msg)
      setGenState('error')
    }
  }

  function answerQuiz(qi: number, optIdx: number) {
    if (quizAnswers[qi] !== null || !exercises) return
    const correct = optIdx === exercises.quiz[qi].correct
    setQuizAnswers(prev => prev.map((v, i) => i === qi ? optIdx : v))
    capture('quiz_answered', { question_index: qi, selected: optIdx, correct })
  }

  function submitCloze(ci: number) {
    if (clozeSubmitted[ci] || !exercises) return
    const answer   = clozeInputs[ci].trim().toLowerCase()
    const expected = exercises.cloze[ci].answer.trim().toLowerCase()
    setClozeSubmitted(prev => prev.map((v, i) => i === ci ? true : v))
    capture('cloze_answered', { item_index: ci, correct: answer === expected })
  }

  function clickTerm(termIdx: number) {
    if (matchedPairs.has(termIdx)) return
    setSelectedTerm(prev => prev === termIdx ? null : termIdx)
  }

  function clickDef(displayIdx: number) {
    if (selectedTerm === null || !exercises) return
    const matchIdx = shuffledDefs[displayIdx]
    const correct  = matchIdx === selectedTerm
    capture('match_pair_attempted', { term_index: selectedTerm, def_index: displayIdx, correct })
    if (correct) {
      const next = new Set(matchedPairs)
      next.add(selectedTerm)
      setMatchedPairs(next)
      setSelectedTerm(null)
      if (next.size === exercises.match.length)
        capture('match_completed', { total: exercises.match.length })
    } else {
      setWrongTermFlash(selectedTerm)
      setTimeout(() => { setWrongTermFlash(null); setSelectedTerm(null) }, 400)
    }
  }

  const selCount = phrases.filter(p => p.sel).length

  const btnBase: React.CSSProperties = {
    border: '1px solid var(--ln)', borderRadius: 4, background: 'transparent',
    cursor: 'pointer', fontFamily: 'var(--font-mono)',
  }

  return (
    <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Level + Scope controls */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' as const }}>
        {(['beginner', 'intermediate', 'advanced'] as Level[]).map(l => (
          <button key={l} onClick={() => setLevel(l)} style={{
            ...btnBase,
            padding: '3px 7px',
            background: level === l ? 'var(--ac)' : 'transparent',
            color: level === l ? '#1a1a1a' : 'var(--tx3)',
            fontSize: 10, textTransform: 'uppercase' as const,
          }}>
            {l}
          </button>
        ))}
        <span style={{ color: 'var(--tx3)', fontSize: 10 }}>·</span>
        <button data-testid="scope-all" onClick={() => setScope('all')} style={{
          ...btnBase, padding: '3px 7px',
          background: scope === 'all' ? 'var(--ac)' : 'transparent',
          color: scope === 'all' ? '#1a1a1a' : 'var(--tx3)',
          fontSize: 10,
        }}>
          Todas
        </button>
        <button data-testid="scope-sel" onClick={() => setScope('sel')} style={{
          ...btnBase, padding: '3px 7px',
          background: scope === 'sel' ? 'var(--ac)' : 'transparent',
          color: scope === 'sel' ? '#1a1a1a' : 'var(--tx3)',
          fontSize: 10,
        }}>
          Sel. ({selCount})
        </button>
      </div>

      {/* Idle */}
      {genState === 'idle' && (
        <button data-testid="btn-generate" onClick={generate} style={{
          ...btnBase, padding: '8px 0', borderColor: 'var(--ac)',
          color: 'var(--ac)', fontSize: 11, letterSpacing: '1px',
          textTransform: 'uppercase' as const,
        }}>
          GENERAR EJERCICIOS
        </button>
      )}

      {/* Generating */}
      {genState === 'generating' && (
        <div style={{ color: 'var(--tx3)', fontSize: 11, textAlign: 'center' as const, padding: '16px 0' }}>
          Generando…
        </div>
      )}

      {/* Error */}
      {genState === 'error' && (
        <>
          <div data-testid="exercises-error" style={{
            color: 'var(--rd)', fontSize: 11, padding: 8,
            border: '1px solid var(--rd)', borderRadius: 4,
          }}>
            {errorMsg || 'Error al generar ejercicios'}
          </div>
          <button data-testid="btn-retry" onClick={generate} style={{
            ...btnBase, padding: '6px 0', borderColor: 'var(--ac)',
            color: 'var(--ac)', fontSize: 10, textTransform: 'uppercase' as const,
          }}>
            REINTENTAR
          </button>
        </>
      )}

      {/* Ready */}
      {genState === 'ready' && exercises && (
        <div>
          {/* Drill sub-tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--ln)', marginBottom: 10 }}>
            {(['quiz', 'cloze', 'match'] as DrillTab[]).map(t => (
              <button key={t} data-testid={`tab-${t}`} onClick={() => setDrillTab(t)} style={{
                flex: 1, padding: '5px 0', border: 'none',
                borderBottom: drillTab === t ? '2px solid var(--ac)' : '2px solid transparent',
                background: 'transparent',
                color: drillTab === t ? 'var(--ac)' : 'var(--tx3)',
                fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase' as const,
              }}>
                {t === 'quiz' ? 'Quiz' : t === 'cloze' ? 'Fill-in' : 'Match'}
              </button>
            ))}
          </div>

          {/* Regenerate */}
          <button data-testid="btn-generate" onClick={generate} style={{
            ...btnBase, width: '100%', padding: '4px 0',
            color: 'var(--tx3)', fontSize: 10, marginBottom: 10,
          }}>
            ↺ REGENERAR
          </button>

          {/* ── Quiz ─────────────────────────────────────────────────────────── */}
          {drillTab === 'quiz' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {exercises.quiz.map((q, qi) => {
                const answered = quizAnswers[qi] !== null
                return (
                  <div key={qi} data-testid={`quiz-q-${qi}`} style={{
                    borderBottom: '1px solid var(--ln2)', paddingBottom: 10,
                  }}>
                    <div style={{ color: 'var(--tx)', fontSize: 12, marginBottom: 6 }}>
                      {qi + 1}. {q.question}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {q.options.map((opt, oi) => {
                        const isChosen  = quizAnswers[qi] === oi
                        const isCorrect = oi === q.correct
                        return (
                          <button
                            key={oi}
                            data-testid={`quiz-q-${qi}-opt-${oi}`}
                            data-correct={isChosen ? String(isCorrect) : undefined}
                            data-answer={answered && !isChosen && isCorrect ? 'true' : undefined}
                            disabled={answered}
                            onClick={() => answerQuiz(qi, oi)}
                            style={{
                              textAlign: 'left' as const, padding: '4px 8px',
                              border: '1px solid var(--ln)', borderRadius: 4,
                              background:
                                !answered                     ? 'transparent'  :
                                isChosen && isCorrect         ? 'var(--gr)'    :
                                isChosen && !isCorrect        ? 'var(--rd)'    :
                                isCorrect                     ? 'rgba(45,184,122,0.18)' :
                                'transparent',
                              color:
                                answered && (isChosen || isCorrect) ? '#fff' : 'var(--tx)',
                              fontSize: 11, cursor: answered ? 'default' : 'pointer',
                            }}
                          >
                            {String.fromCharCode(65 + oi)}. {opt}
                          </button>
                        )
                      })}
                    </div>
                    {answered && (
                      <div data-testid={`quiz-q-${qi}-explanation`} style={{
                        color: 'var(--tx3)', fontSize: 10, marginTop: 5,
                      }}>
                        {q.explanation}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Fill-in / Cloze ──────────────────────────────────────────────── */}
          {drillTab === 'cloze' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {exercises.cloze.map((c, ci) => {
                const submitted = clozeSubmitted[ci]
                const answer    = clozeInputs[ci].trim().toLowerCase()
                const expected  = c.answer.trim().toLowerCase()
                const correct   = submitted && answer === expected
                const parts     = c.sentence.split('___')
                return (
                  <div key={ci} style={{ fontSize: 12, color: 'var(--tx)', lineHeight: '1.8' }}>
                    <span>{parts[0]}</span>
                    <input
                      data-testid={`cloze-input-${ci}`}
                      type="text"
                      value={clozeInputs[ci]}
                      disabled={submitted}
                      data-correct={submitted ? String(correct) : undefined}
                      onChange={e => {
                        if (!submitted)
                          setClozeInputs(prev => prev.map((v, i) => i === ci ? e.target.value : v))
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') submitCloze(ci) }}
                      style={{
                        width: 80, padding: '1px 4px',
                        border: '1px solid var(--ln)', borderRadius: 3,
                        background: 'var(--p3)',
                        color: submitted
                          ? (correct ? 'var(--gr)' : 'var(--rd)')
                          : 'var(--tx)',
                        fontSize: 12,
                      }}
                    />
                    <span>{parts[1]}</span>
                    {submitted && !correct && (
                      <span data-testid={`cloze-reveal-${ci}`} style={{
                        color: 'var(--gr)', marginLeft: 4, fontSize: 10,
                      }}>
                        → {c.answer}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Match ────────────────────────────────────────────────────────── */}
          {drillTab === 'match' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {exercises.match.map((m, mi) => {
                  const matched  = matchedPairs.has(mi)
                  const selected = selectedTerm === mi
                  const flashing = wrongTermFlash === mi
                  return (
                    <button
                      key={mi}
                      data-testid={`match-term-${mi}`}
                      data-matched={matched ? 'true' : undefined}
                      data-selected={selected ? 'true' : undefined}
                      onClick={() => !matched && clickTerm(mi)}
                      style={{
                        ...btnBase, padding: '4px 6px', textAlign: 'left' as const,
                        background:
                          matched  ? 'rgba(45,184,122,0.18)' :
                          flashing ? 'rgba(204,68,68,0.18)'  :
                          selected ? 'rgba(232,197,71,0.18)' :
                          'transparent',
                        color:
                          matched  ? 'var(--gr)'  :
                          flashing ? 'var(--rd)'  :
                          selected ? 'var(--ac)'  :
                          'var(--tx)',
                        fontSize: 11, cursor: matched ? 'default' : 'pointer',
                      }}
                    >
                      {m.term}
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {shuffledDefs.map((matchIdx, di) => {
                  const matched = matchedPairs.has(matchIdx)
                  return (
                    <button
                      key={di}
                      data-testid={`match-def-${di}`}
                      onClick={() => !matched && clickDef(di)}
                      style={{
                        ...btnBase, padding: '4px 6px', textAlign: 'left' as const,
                        background: matched ? 'rgba(45,184,122,0.18)' : 'transparent',
                        color: matched ? 'var(--gr)' : 'var(--tx)',
                        fontSize: 11, cursor: matched ? 'default' : 'pointer',
                      }}
                    >
                      {exercises.match[matchIdx].definition}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
