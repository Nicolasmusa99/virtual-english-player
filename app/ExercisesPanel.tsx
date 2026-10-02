// VE Drills (Bloque 14) — extended in Bloque 15
// Rediseño (fase 6): estilos en exercises.module.css (tokens: sirve en la sala y en el
// aula), textos en castellano y sin mayúsculas; la respuesta se marca con palabra, no solo color.
'use client'
import { useEffect, useState } from 'react'
import type { Phrase } from '@/lib/srt'
import type { Level, Scope, GenState, ExerciseSet, MatchItem, ExerciseMode, PdfType, PdfVersion } from '@/lib/exercises'
import { resolveScope } from '@/lib/exercises'
import { buildStudentContent, buildTeacherContent } from '@/lib/pdf'
import { capture } from '@/lib/capture'
import styles from './exercises.module.css'

interface Props {
  phrases: Phrase[]
  videoFileName: string
  singleMode?: ExerciseMode
}

type DrillTab = 'quiz' | 'cloze' | 'match'

export const EXERCISES_TEXTS = {
  source: 'De dónde salen',
  modes: { video: 'Del video', topic: 'De un tema', both: 'Video y tema' } as Record<ExerciseMode, string>,
  topic: 'Tema',
  topicPh: 'Por ejemplo: la Segunda Guerra Mundial',
  level: 'Nivel',
  levels: { beginner: 'Básico', intermediate: 'Intermedio', advanced: 'Avanzado' } as Record<Level, string>,
  phrases: 'Frases',
  all: 'Todas',
  chosen: (n: number) => `Elegidas (${n})`,
  generate: 'Generar ejercicios',
  generating: 'Generando ejercicios…',
  error: 'No se pudieron generar los ejercicios.',
  retry: 'Reintentar',
  regenerate: 'Generar otros',
  pdf: 'Descargar en PDF',
  include: 'Qué incluir',
  version: 'Para quién',
  versions: { student: 'Alumno', teacher: 'Profesor (con respuestas)', both: 'Los dos' } as Record<PdfVersion, string>,
  download: 'Descargar',
  close: 'Cerrar',
  kindsLabel: 'Tipo de ejercicio',
  kinds: { quiz: 'Preguntas', cloze: 'Completar', match: 'Unir' } as Record<DrillTab, string>,
  right: 'Correcta', wrong: 'Incorrecta', wasThis: 'Era esta',
  clozeHint: 'Escribí la palabra que falta y apretá Enter.',
  blank: (n: number) => `Palabra que falta ${n}`,
  answer: (a: string) => `Respuesta: ${a}`,
} as const

export default function ExercisesPanel({ phrases, videoFileName, singleMode }: Props) {
  // ── source / generation state ────────────────────────────────────────────
  const [mode, setMode]           = useState<ExerciseMode>(singleMode ?? (phrases.length > 0 ? 'video' : 'topic'))
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
  const T = EXERCISES_TEXTS

  return (
    <div className={styles.panel}>

      {/* ── Bloque 15: de dónde salen (oculto cuando singleMode fija el modo) ── */}
      {!singleMode && (
        <div className={styles.field}>
          <span className={styles.lbl}>{T.source}</span>
          <div className={styles.seg} role="group" aria-label={T.source}>
            {(['video', 'topic', 'both'] as ExerciseMode[]).map(m => (
              <button
                key={m}
                type="button"
                data-testid={`mode-${m}`}
                data-active={mode === m ? 'true' : 'false'}
                aria-pressed={mode === m}
                onClick={() => handleModeChange(m)}
                className={styles.segBtn}
              >
                {T.modes[m]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Bloque 15: tema (cuando el modo no es solo video) ── */}
      {mode !== 'video' && (
        <label className={styles.field}>
          <span className={styles.lbl}>{T.topic}</span>
          <input
            data-testid="topic-input"
            type="text"
            value={topic}
            placeholder={T.topicPh}
            onChange={e => setTopic(e.target.value)}
            className={styles.input}
          />
        </label>
      )}

      {/* Nivel */}
      <div className={styles.field}>
        <span className={styles.lbl}>{T.level}</span>
        <div className={styles.seg} role="group" aria-label={T.level}>
          {(['beginner', 'intermediate', 'advanced'] as Level[]).map(l => (
            <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)} className={styles.segBtn}>
              {T.levels[l]}
            </button>
          ))}
        </div>
      </div>

      {/* Qué frases (no aplica a "solo tema") */}
      {mode !== 'topic' && (
        <div className={styles.field}>
          <span className={styles.lbl}>{T.phrases}</span>
          <div className={styles.seg} role="group" aria-label={T.phrases}>
            <button type="button" data-testid="scope-all" aria-pressed={scope === 'all'} onClick={() => setScope('all')} className={styles.segBtn}>
              {T.all}
            </button>
            <button type="button" data-testid="scope-sel" aria-pressed={scope === 'sel'} onClick={() => setScope('sel')} className={styles.segBtn}>
              {T.chosen(selCount)}
            </button>
          </div>
        </div>
      )}

      {/* Idle */}
      {genState === 'idle' && (
        <button type="button" data-testid="btn-generate" disabled={generateDisabled} onClick={generate} className={styles.primary}>
          {T.generate}
        </button>
      )}

      {/* Generating */}
      {genState === 'generating' && <div className={styles.msg} role="status">{T.generating}</div>}

      {/* Error */}
      {genState === 'error' && (
        <>
          <div data-testid="exercises-error" role="alert" className={styles.error}>
            {errorMsg || T.error}
          </div>
          <div className={styles.acts}>
            <button type="button" data-testid="btn-retry" onClick={generate} className={styles.secondary}>{T.retry}</button>
          </div>
        </>
      )}

      {/* Ready */}
      {genState === 'ready' && exercises && (
        <>
          <div className={styles.acts}>
            <button type="button" data-testid="btn-generate" onClick={generate} className={styles.secondary}>{T.regenerate}</button>
            <button type="button" data-testid="btn-pdf" onClick={() => setPdfOpen(true)} className={styles.secondary}>{T.pdf}</button>
          </div>

          {/* ── Bloque 15: PDF ── */}
          {pdfOpen && (
            <div data-testid="pdf-panel" className={styles.pdf}>
              <div className={styles.field}>
                <span className={styles.lbl}>{T.include}</span>
                <div className={styles.checks}>
                  {(['quiz', 'cloze', 'match'] as PdfType[]).map(t => (
                    <label key={t} className={styles.check}>
                      <input
                        type="checkbox"
                        data-testid={`pdf-type-${t}`}
                        checked={pdfTypes.includes(t)}
                        onChange={() => togglePdfType(t)}
                      />
                      {T.kinds[t]}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <span className={styles.lbl}>{T.version}</span>
                <div className={styles.checks}>
                  {(['student', 'teacher', 'both'] as PdfVersion[]).map(v => (
                    <label key={v} className={styles.check}>
                      <input
                        type="radio"
                        data-testid={`pdf-version-${v}`}
                        name="pdf-version"
                        checked={pdfVersion === v}
                        onChange={() => setPdfVersion(v)}
                      />
                      {T.versions[v]}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.acts}>
                <button type="button" data-testid="btn-pdf-confirm" disabled={pdfTypes.length === 0} onClick={downloadPdf} className={styles.primary}>
                  {T.download}
                </button>
                <button type="button" onClick={() => setPdfOpen(false)} className={styles.textBtn}>{T.close}</button>
              </div>
            </div>
          )}

          {/* Pestañas: Preguntas / Completar / Unir */}
          <div className={styles.tabs} role="group" aria-label={T.kindsLabel}>
            {(['quiz', 'cloze', 'match'] as DrillTab[]).map(t => (
              <button key={t} type="button" data-testid={`tab-${t}`} aria-pressed={drillTab === t} onClick={() => setDrillTab(t)}
                className={`${styles.tab} ${drillTab === t ? styles.tabOn : ''}`}>
                {T.kinds[t]}
              </button>
            ))}
          </div>

          {/* ── Preguntas (quiz) ─────────────────────────────────────────────── */}
          {drillTab === 'quiz' && (
            <div className={styles.list}>
              {exercises.quiz.map((q, qi) => {
                const answered = quizAnswers[qi] !== null
                return (
                  <div key={qi} data-testid={`quiz-q-${qi}`} className={styles.q}>
                    <div className={styles.qText}><span className={styles.qNum}>{qi + 1}.</span> {q.question}</div>
                    <div className={styles.opts}>
                      {q.options.map((opt, oi) => {
                        const isChosen  = quizAnswers[qi] === oi
                        const isCorrect = oi === q.correct
                        const state = !answered ? '' : isCorrect ? styles.optOk : isChosen ? styles.optBad : ''
                        return (
                          <button
                            key={oi}
                            type="button"
                            data-testid={`quiz-q-${qi}-opt-${oi}`}
                            data-correct={isChosen ? String(isCorrect) : undefined}
                            data-answer={answered && !isChosen && isCorrect ? 'true' : undefined}
                            disabled={answered}
                            onClick={() => answerQuiz(qi, oi)}
                            className={`${styles.opt} ${state}`}
                          >
                            <span className={styles.optLetter}>{String.fromCharCode(65 + oi)}</span>
                            <span className={styles.optText}>{opt}</span>
                            {answered && (isChosen || isCorrect) && (
                              <span className={styles.optMark}>{isCorrect ? (isChosen ? T.right : T.wasThis) : T.wrong}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    {answered && (
                      <div data-testid={`quiz-q-${qi}-explanation`} className={styles.explain}>
                        {q.explanation}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Completar (cloze) ────────────────────────────────────────────── */}
          {drillTab === 'cloze' && (
            <div className={styles.list}>
              <div className={styles.hint}>{T.clozeHint}</div>
              {exercises.cloze.map((c, ci) => {
                const submitted = clozeSubmitted[ci]
                const answer    = clozeInputs[ci].trim().toLowerCase()
                const expected  = c.answer.trim().toLowerCase()
                const correct   = submitted && answer === expected
                const parts     = c.sentence.split('___')
                return (
                  <div key={ci} className={styles.cloze}>
                    <span>{parts[0]}</span>
                    <input
                      data-testid={`cloze-input-${ci}`}
                      type="text"
                      aria-label={T.blank(ci + 1)}
                      value={clozeInputs[ci]}
                      disabled={submitted}
                      data-correct={submitted ? String(correct) : undefined}
                      onChange={e => {
                        if (!submitted)
                          setClozeInputs(prev => prev.map((v, i) => i === ci ? e.target.value : v))
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') submitCloze(ci) }}
                      className={`${styles.blank} ${submitted ? (correct ? styles.blankOk : styles.blankBad) : ''}`}
                    />
                    <span>{parts[1]}</span>
                    {submitted && !correct && (
                      <span data-testid={`cloze-reveal-${ci}`} className={styles.reveal}>
                        {T.answer(c.answer)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Unir (match) ─────────────────────────────────────────────────── */}
          {drillTab === 'match' && (
            <div className={styles.match}>
              <div className={styles.col}>
                {exercises.match.map((m, mi) => {
                  const matched  = matchedPairs.has(mi)
                  const selected = selectedTerm === mi
                  const flashing = wrongTermFlash === mi
                  return (
                    <button
                      key={mi}
                      type="button"
                      data-testid={`match-term-${mi}`}
                      data-matched={matched ? 'true' : undefined}
                      data-selected={selected ? 'true' : undefined}
                      aria-pressed={selected}
                      onClick={() => !matched && clickTerm(mi)}
                      className={`${styles.pair} ${matched ? styles.pairOk : flashing ? styles.pairBad : selected ? styles.pairSel : ''}`}
                    >
                      {m.term}
                    </button>
                  )
                })}
              </div>
              <div className={styles.col}>
                {shuffledDefs.map((matchIdx, di) => {
                  const matched = matchedPairs.has(matchIdx)
                  return (
                    <button
                      key={di}
                      type="button"
                      data-testid={`match-def-${di}`}
                      onClick={() => !matched && clickDef(di)}
                      className={`${styles.pair} ${matched ? styles.pairOk : ''}`}
                    >
                      {exercises.match[matchIdx].definition}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
