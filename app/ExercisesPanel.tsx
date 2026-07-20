// VE Drills (Bloque 14) — extended in Bloque 15
'use client'
import { useEffect, useState } from 'react'
import type { Phrase } from '@/lib/srt'
import type { Level, Scope, GenState, ExerciseSet, MatchItem, ExerciseMode, PdfType, PdfVersion } from '@/lib/exercises'
import { resolveScope } from '@/lib/exercises'
import { buildStudentContent, buildTeacherContent } from '@/lib/pdf'
import { capture } from '@/lib/capture'

interface Props {
  phrases: Phrase[]
  videoFileName: string
}

type DrillTab = 'quiz' | 'cloze' | 'match'

export default function ExercisesPanel({ phrases, videoFileName }: Props) {
  // ── source / generation state ────────────────────────────────────────────
  const [mode, setMode]           = useState<ExerciseMode>(phrases.length > 0 ? 'video' : 'topic')
  const [topic, setTopic]         = useState('')
  const [level, setLevel]         = useState<Level>('intermediate')
  const [scope, setScope]         = useState<Scope>('all')
  const [genState, setGenState]   = useState<GenState>('idle')
  const [exercises, setExercises] = useState<ExerciseSet | null>(null)
  const [errorMsg, setErrorMsg]   = useState('')
  const [drillTab, setDrillTab]   = useState<DrillTab>('quiz')

  // ── quiz state ───────────────────────────────────────────────────────────
  const [quizAnswers, setQuizAnswers]       = useState<(number | null)[]>([])

  // ── cloze state ──────────────────────────────────────────────────────────
  const [clozeInputs, setClozeInputs]       = useState<string[]>([])
  const [clozeSubmitted, setClozeSubmitted] = useState<boolean[]>([])

  // ── match state ──────────────────────────────────────────────────────────
  const [shuffledDefs, setShuffledDefs]     = useState<number[]>([])
  const [matchedPairs, setMatchedPairs]     = useState<Set<number>>(new Set())
  const [selectedTerm, setSelectedTerm]     = useState<number | null>(null)
  const [wrongTermFlash, setWrongTermFlash] = useState<number | null>(null)

  // ── PDF panel state ──────────────────────────────────────────────────────
  const [pdfOpen, setPdfOpen]           = useState(false)
  const [pdfTypes, setPdfTypes]         = useState<PdfType[]>(['quiz', 'cloze', 'match'])
  const [pdfVersion, setPdfVersion]     = useState<PdfVersion>('student')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    capture('exercises_tab_opened', {
      video_file_name: videoFileName,
      selected_count:  phrases.filter(p => p.sel).length,
    })
  }, [])

  function handleModeChange(m: ExerciseMode) {
    setMode(m)
    capture('exercises_source_mode_changed', { mode: m, has_video: phrases.length > 0 })
  }

  const generateDisabled =
    (mode === 'topic' || mode === 'both') && !topic.trim()

  async function generate() {
    const sourcePhrases = (mode === 'topic') ? [] : resolveScope(phrases, scope)
    const startMs = Date.now()
    capture('exercises_generation_started', {
      mode, level, scope,
      phrase_count:    sourcePhrases.length,
      video_file_name: videoFileName,
    })
    setGenState('generating')
    setErrorMsg('')

    let httpStatus = 0
    try {
      const payload: Record<string, unknown> = { level, mode }
      if (mode !== 'topic') payload.phrases = sourcePhrases
      if (mode !== 'video') payload.topic = topic.trim()

      const res = await fetch('/api/exercises', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
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
        level, mode,
      })
      setGenState('ready')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      capture('exercises_generation_failed', { http_status: httpStatus, error: msg, level, mode })
      setErrorMsg(msg)
      setGenState('error')
    }
  }

  async function downloadPdf() {
    if (!exercises) return
    const { jsPDF } = await import('jspdf')

    const makePdf = (version: 'student' | 'teacher') => {
      const doc    = new jsPDF()
      const W      = 170 // usable width mm
      const margin = 20
      let y        = margin

      const write = (text: string, bold = false, size = 11) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal')
        doc.setFontSize(size)
        const lines = doc.splitTextToSize(text, W) as string[]
        for (const line of lines) {
          if (y > 270) { doc.addPage(); y = margin }
          doc.text(line, margin, y)
          y += size * 0.45
        }
      }

      const title = version === 'student' ? 'Exercises' : 'Exercise Answer Key'
      write(title, true, 16)
      y += 4

      const blocks = version === 'student'
        ? buildStudentContent(exercises!, pdfTypes)
        : buildTeacherContent(exercises!, pdfTypes)

      for (const block of blocks) {
        y += 4
        write(block.heading, true, 13)
        y += 2
        for (const line of block.lines) write(line)
        y += 2
      }

      doc.save(version === 'student' ? 'ejercicios-alumno.pdf' : 'ejercicios-profesor.pdf')
    }

    if (pdfVersion === 'both') {
      makePdf('student')
      makePdf('teacher')
    } else {
      makePdf(pdfVersion)
    }

    capture('exercises_pdf_downloaded', {
      version:     pdfVersion,
      types:       pdfTypes.join(','),
      source_mode: mode,
    })
    setPdfOpen(false)
  }

  function togglePdfType(t: PdfType) {
    setPdfTypes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    )
  }

  // ── quiz ──────────────────────────────────────────────────────────────────
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

      {/* ── Bloque 15: Source mode selector ── */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
        {(['video', 'topic', 'both'] as ExerciseMode[]).map(m => (
          <button
            key={m}
            data-testid={`mode-${m}`}
            data-active={mode === m ? 'true' : 'false'}
            onClick={() => handleModeChange(m)}
            style={{
              ...btnBase, padding: '3px 8px', fontSize: 10,
              textTransform: 'uppercase' as const,
              background: mode === m ? 'var(--ac)' : 'transparent',
              color: mode === m ? '#1a1a1a' : 'var(--tx3)',
            }}
          >
            {m === 'video' ? 'Video' : m === 'topic' ? 'Tópico' : 'Ambos'}
          </button>
        ))}
      </div>

      {/* ── Bloque 15: Topic input (visible when mode !== video) ── */}
      {mode !== 'video' && (
        <input
          data-testid="topic-input"
          type="text"
          value={topic}
          placeholder="Topic (e.g. Second World War)"
          onChange={e => setTopic(e.target.value)}
          style={{
            padding: '5px 8px', border: '1px solid var(--ln)', borderRadius: 4,
            background: 'var(--p3)', color: 'var(--tx)', fontSize: 11,
            fontFamily: 'var(--font-mono)',
          }}
        />
      )}

      {/* Level + Scope controls */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' as const }}>
        {(['beginner', 'intermediate', 'advanced'] as Level[]).map(l => (
          <button key={l} onClick={() => setLevel(l)} style={{
            ...btnBase, padding: '3px 7px',
            background: level === l ? 'var(--ac)' : 'transparent',
            color: level === l ? '#1a1a1a' : 'var(--tx3)',
            fontSize: 10, textTransform: 'uppercase' as const,
          }}>
            {l}
          </button>
        ))}
        {/* Scope selector hidden in topic-only mode */}
        {mode !== 'topic' && (
          <>
            <span style={{ color: 'var(--tx3)', fontSize: 10 }}>·</span>
            <button data-testid="scope-all" onClick={() => setScope('all')} style={{
              ...btnBase, padding: '3px 7px',
              background: scope === 'all' ? 'var(--ac)' : 'transparent',
              color: scope === 'all' ? '#1a1a1a' : 'var(--tx3)', fontSize: 10,
            }}>
              Todas
            </button>
            <button data-testid="scope-sel" onClick={() => setScope('sel')} style={{
              ...btnBase, padding: '3px 7px',
              background: scope === 'sel' ? 'var(--ac)' : 'transparent',
              color: scope === 'sel' ? '#1a1a1a' : 'var(--tx3)', fontSize: 10,
            }}>
              Sel. ({selCount})
            </button>
          </>
        )}
      </div>

      {/* Idle */}
      {genState === 'idle' && (
        <button
          data-testid="btn-generate"
          disabled={generateDisabled}
          onClick={generate}
          style={{
            ...btnBase, padding: '8px 0', borderColor: 'var(--ac)',
            color: generateDisabled ? 'var(--tx3)' : 'var(--ac)',
            fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase' as const,
            opacity: generateDisabled ? 0.4 : 1, cursor: generateDisabled ? 'default' : 'pointer',
          }}
        >
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

          {/* Regenerate + PDF buttons */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button data-testid="btn-generate" onClick={generate} style={{
              ...btnBase, flex: 1, padding: '4px 0',
              color: 'var(--tx3)', fontSize: 10,
            }}>
              ↺ REGENERAR
            </button>
            <button data-testid="btn-pdf" onClick={() => setPdfOpen(true)} style={{
              ...btnBase, padding: '4px 10px', borderColor: 'var(--ac)',
              color: 'var(--ac)', fontSize: 10,
            }}>
              PDF
            </button>
          </div>

          {/* ── Bloque 15: PDF panel ── */}
          {pdfOpen && (
            <div data-testid="pdf-panel" style={{
              border: '1px solid var(--ln)', borderRadius: 6, padding: 12,
              marginBottom: 10, background: 'var(--p2)',
            }}>
              <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 8, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' as const }}>
                Tipos a incluir
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                {(['quiz', 'cloze', 'match'] as PdfType[]).map(t => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--tx)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      data-testid={`pdf-type-${t}`}
                      checked={pdfTypes.includes(t)}
                      onChange={() => togglePdfType(t)}
                    />
                    {t === 'quiz' ? 'Quiz' : t === 'cloze' ? 'Fill-in' : 'Match'}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--tx3)', marginBottom: 8, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' as const }}>
                Versión
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                {(['student', 'teacher', 'both'] as PdfVersion[]).map(v => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--tx)', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      data-testid={`pdf-version-${v}`}
                      name="pdf-version"
                      checked={pdfVersion === v}
                      onChange={() => setPdfVersion(v)}
                    />
                    {v === 'student' ? 'Alumno' : v === 'teacher' ? 'Profesor' : 'Ambas'}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  data-testid="btn-pdf-confirm"
                  disabled={pdfTypes.length === 0}
                  onClick={downloadPdf}
                  style={{
                    ...btnBase, flex: 1, padding: '6px 0', borderColor: 'var(--ac)',
                    color: pdfTypes.length === 0 ? 'var(--tx3)' : 'var(--ac)',
                    fontSize: 10, textTransform: 'uppercase' as const,
                    opacity: pdfTypes.length === 0 ? 0.4 : 1,
                    cursor: pdfTypes.length === 0 ? 'default' : 'pointer',
                  }}
                >
                  DESCARGAR
                </button>
                <button onClick={() => setPdfOpen(false)} style={{
                  ...btnBase, padding: '6px 10px', color: 'var(--tx3)', fontSize: 10,
                }}>
                  ✕
                </button>
              </div>
            </div>
          )}

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
                              color: answered && (isChosen || isCorrect) ? '#fff' : 'var(--tx)',
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
                        color: submitted ? (correct ? 'var(--gr)' : 'var(--rd)') : 'var(--tx)',
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
