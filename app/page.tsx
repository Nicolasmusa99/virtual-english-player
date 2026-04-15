'use client'
import { useRef, useState, useEffect } from 'react'
import styles from './page.module.css'

interface Phrase { start: number; end: number; text: string; sel: boolean }
type Step = 'idle' | 'uploading' | 'transcribing' | 'parsing' | 'done'

function timeToSec(s: string): number {
  const c = s.replace(',', '.').trim().split(':')
  if (c.length === 3) return +c[0] * 3600 + +c[1] * 60 + +c[2]
  if (c.length === 2) return +c[0] * 60 + +c[1]
  return +c[0]
}

function parseSRT(text: string): Phrase[] {
  const result: Phrase[] = []
  const clean = text.replace(/```[a-z]*\n?/gi, '').trim()
  const blocks = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\n+/)
  blocks.forEach(block => {
    const lines = block.trim().split('\n')
    const tl = lines.find(l => l.includes('-->'))
    if (!tl) return
    const [a, b] = tl.split('-->').map(s => s.trim())
    const start = timeToSec(a), end = timeToSec(b)
    const idx = lines.indexOf(tl)
    const txt = lines.slice(idx + 1).join(' ').replace(/<[^>]+>/g, '').trim()
    if (txt && !isNaN(start) && start >= 0) result.push({ start, end, text: txt, sel: true })
  })
  return result
}

function fmtTime(s: number): string {
  if (isNaN(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60), sc = Math.floor(s % 60)
  return `${m}:${sc < 10 ? '0' : ''}${sc}`
}

const SKIP = new Set(['the','and','a','an','in','on','of','to','i','you','my','for','that','this','they','how','with','out','now','not','did','know','your','at','is','was','are','were','be','been','it','he','she','we','as','by','from','but','so','if','or','el','la','los','las','de','en','que','un','una','y','se','no','es','por','con','su','para','lo','le','al','me','te','nos'])

function hl(text: string): string {
  return text.split(' ').map(w => {
    const c = w.replace(/[.,!?;'"—\-¿¡:]/g, '').toLowerCase()
    return (!SKIP.has(c) && c.length > 3) ? `<span style="color:#E8C547">${w}</span>` : w
  }).join(' ')
}

const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5]

export default function Player() {
  const vidRef = useRef<HTMLVideoElement>(null)
  const progRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  const [screen, setScreen] = useState<'load' | 'player'>('load')
  const [step, setStep] = useState<Step>('idle')
  const [stepMsg, setStepMsg] = useState('')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [videoFileName, setVideoFileName] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [srtSource, setSrtSource] = useState('')

  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [curIdx, setCurIdx] = useState(-1)
  const [ccOn, setCcOn] = useState(true)
  const [delay, setDelay] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(2)
  const [filter, setFilter] = useState<'all' | 'sel'>('all')
  const [subText, setSubText] = useState('')
  const [subVisible, setSubVisible] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')
  const [timeCur, setTimeCur] = useState('0:00')
  const [timeTot, setTimeTot] = useState('0:00')
  const [progPct, setProgPct] = useState(0)
  const [bufPct, setBufPct] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [vol, setVol] = useState(100)

  const phrasesRef = useRef<Phrase[]>([])
  const curIdxRef = useRef(-1)
  const ccRef = useRef(true)
  const delayRef = useRef(0)

  useEffect(() => { 
    phrasesRef.current = phrases
    // Force subtitle check when phrases load
    const v = vidRef.current
    if (v && v.currentTime > 0 && phrases.length > 0) {
      const t = v.currentTime - delayRef.current
      const ph = phrases.find(p => t >= p.start && t <= p.end)
      if (ph && ccRef.current) { setSubText(hl(ph.text)); setSubVisible(true) }
    }
  }, [phrases])
  useEffect(() => { curIdxRef.current = curIdx }, [curIdx])
  useEffect(() => { ccRef.current = ccOn }, [ccOn])
  useEffect(() => { delayRef.current = delay }, [delay])
  // src set directly on video element via state

  useEffect(() => {
    const v = vidRef.current; if (!v) return
    const onMeta = () => setTimeTot(fmtTime(v.duration))
    const onEnded = () => { setIsPlaying(false); setSubText("") }
    const onProg = () => {
      try { if (v.buffered.length > 0) setBufPct(v.buffered.end(v.buffered.length - 1) / v.duration * 100) } catch {}
    }
    const onTU = () => {
      if (!v.duration) return
      setProgPct(v.currentTime / v.duration * 100)
      setTimeCur(fmtTime(v.currentTime))
      const t = v.currentTime - delayRef.current
      const ps = phrasesRef.current
      if (ps.length === 0) return
      const ph = ps.find(p => t >= p.start && t <= p.end)
      if (ph && ccRef.current) { setSubText(hl(ph.text)); setSubVisible(true) }
      else { setSubVisible(false); setSubText('') }
      const idx = ps.findIndex(p => t >= p.start && t <= p.end)
      if (idx !== -1 && idx !== curIdxRef.current) setCurIdx(idx)
    }
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('timeupdate', onTU)
    v.addEventListener('progress', onProg)
    v.addEventListener('ended', onEnded)
    return () => {
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('timeupdate', onTU)
      v.removeEventListener('progress', onProg)
      v.removeEventListener('ended', onEnded)
    }
  }, [])


  // RAF-based subtitle sync — more reliable than timeupdate alone
  useEffect(() => {
    if (screen !== 'player') return
    let rafId: number
    const sync = () => {
      const v = vidRef.current
      if (v && !v.paused && phrasesRef.current.length > 0) {
        const t = v.currentTime - delayRef.current
        const ph = phrasesRef.current.find(p => t >= p.start && t <= p.end)
        if (ph && ccRef.current) {
          setSubText(hl(ph.text))
          setSubVisible(true)
        } else {
          setSubVisible(false)
          setSubText('')
        }
      }
      rafId = requestAnimationFrame(sync)
    }
    rafId = requestAnimationFrame(sync)
    return () => cancelAnimationFrame(rafId)
  }, [screen])

  useEffect(() => {
    if (screen !== 'player') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      switch (e.key) {
        case ' ': e.preventDefault(); togglePlay(); break
        case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); prevPhrase(); break
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); nextPhrase(); break
        case 'w': case 'W': e.preventDefault(); microRepeat(); break
        case 'r': case 'R': e.preventDefault(); repeatPhrase(); break
        case 'ArrowUp': e.preventDefault(); if (vidRef.current) vidRef.current.volume = Math.min(1, vidRef.current.volume + 0.1); break
        case 'ArrowDown': e.preventDefault(); if (vidRef.current) vidRef.current.volume = Math.max(0, vidRef.current.volume - 0.1); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen])

  useEffect(() => {
    if (listRef.current) {
      const act = listRef.current.querySelector('[data-act="true"]')
      if (act) act.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [curIdx])

  function togglePlay() {
    const v = vidRef.current; if (!v) return
    if (v.paused) { v.play(); setIsPlaying(true) }
    else { v.pause(); setIsPlaying(false) }
  }
  function skip(s: number) {
    const v = vidRef.current; if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + s))
  }
  function scrub(e: React.MouseEvent) {
    const v = vidRef.current; if (!v?.duration) return
    const r = progRef.current!.getBoundingClientRect()
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * v.duration
  }
  function jumpTo(idx: number) {
    if (idx < 0 || idx >= phrasesRef.current.length) return
    setCurIdx(idx)
    if (vidRef.current) vidRef.current.currentTime = phrasesRef.current[idx].start + 0.05
  }
  function prevPhrase() { jumpTo(Math.max(0, curIdxRef.current - 1)) }
  function nextPhrase() { jumpTo(Math.min(phrasesRef.current.length - 1, curIdxRef.current + 1)) }
  function repeatPhrase() { if (curIdxRef.current >= 0 && vidRef.current) vidRef.current.currentTime = phrasesRef.current[curIdxRef.current].start + 0.05 }
  function microRepeat() {
    if (curIdxRef.current < 0 || !vidRef.current) return
    vidRef.current.currentTime = Math.max(phrasesRef.current[curIdxRef.current].start, vidRef.current.currentTime - 2)
    setSubVisible(false); setTimeout(() => setSubVisible(true), 80)
  }
  function toggleSel(idx: number) { setPhrases(prev => prev.map((p, i) => i === idx ? { ...p, sel: !p.sel } : p)) }
  function setSpd(idx: number) { setSpeedIdx(idx); if (vidRef.current) vidRef.current.playbackRate = SPEEDS[idx] }
  function adjDelay(d: number) {
    setDelay(prev => { const n = Math.round((prev + d) * 10) / 10; delayRef.current = n; return n })
  }

  function handleFiles(files: File[]) {
    let vf: File | null = null, sf: File | null = null
    files.forEach(f => {
      if (f.name.match(/\.(srt|vtt)$/i)) sf = f
      else if (f.type.startsWith('video/') || f.name.match(/\.(avi|mp4|mkv|mov|webm|m4v)$/i)) vf = f
    })
    if (!vf) { setErrorMsg('Arrastrá un archivo de video (MP4, AVI, MKV...)'); return }
    setErrorMsg('')
    setVideoFileName(vf.name)
    setVideoUrl(URL.createObjectURL(vf))
    if (sf) {
      const r = new FileReader()
      r.onload = e => {
        const parsed = parseSRT(e.target!.result as string)
        if (parsed.length === 0) { setErrorMsg('El SRT no tiene subtítulos válidos.'); return }
        setPhrases(parsed); setSrtSource(`SRT · ${parsed.length} frases`)
        setScreen('player')
      }
      r.readAsText(sf, 'UTF-8')
    } else {
      transcribe(vf)
    }
  }

  // Upload file to our server via XHR for upload progress
  // Server handles Gemini upload + transcription
  function transcribe(videoFile: File) {
    setStep('uploading')
    setStepMsg(`Subiendo video (${(videoFile.size / 1024 / 1024).toFixed(0)} MB)...`)
    setProgress(5)
    setErrorMsg('')

    const fd = new FormData()
    fd.append('file', videoFile, videoFile.name)

    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round(e.loaded / e.total * 100)
        setStepMsg(`Subiendo al servidor — ${pct}%`)
        setProgress(5 + pct * 0.3) // 5% → 35%
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText)
          if (data.error) {
            setErrorMsg(data.error); setStep('idle'); setProgress(0)
            return
          }
          const parsed = parseSRT(data.srt)
          if (parsed.length === 0) {
            setErrorMsg('No se generaron subtítulos. El video puede no tener audio detectable.')
            setStep('idle'); setProgress(0)
            return
          }
          // Auto-download SRT
          const a = document.createElement('a')
          a.href = URL.createObjectURL(new Blob([data.srt], { type: 'text/plain;charset=utf-8' }))
          a.download = videoFile.name.replace(/\.[^.]+$/, '') + '.srt'
          document.body.appendChild(a); a.click(); document.body.removeChild(a)

          setPhrases(parsed)
          setSrtSource(`Gemini AI · ${parsed.length} frases`)
          setProgress(100); setStep('done')
          setTimeout(() => setScreen('player'), 300)
        } catch {
          setErrorMsg('Error al procesar la respuesta del servidor')
          setStep('idle'); setProgress(0)
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText)
          setErrorMsg(data.error || `Error del servidor: ${xhr.status}`)
        } catch {
          setErrorMsg(`Error del servidor: ${xhr.status}`)
        }
        setStep('idle'); setProgress(0)
      }
    }

    xhr.onerror = () => {
      setErrorMsg('Error de red. Verificá tu conexión.')
      setStep('idle'); setProgress(0)
    }

    xhr.onreadystatechange = () => {
      // Update step messages based on progress
      if (xhr.readyState === 4) return // handled in onload
    }

    // Fake progress for server-side processing (after upload)
    xhr.upload.onloadend = () => {
      setStep('transcribing')
      setStepMsg('Gemini transcribiendo el audio...')
      setProgress(40)
      // Animate progress while waiting for server response
      let p = 40
      const interval = setInterval(() => {
        p = Math.min(p + Math.random() * 2, 88)
        setProgress(p)
        if (p >= 88) clearInterval(interval)
      }, 2000)
      // Store interval ID to clear later
      xhr.addEventListener('loadend', () => clearInterval(interval))
    }

    xhr.open('POST', '/api/transcribe')
    xhr.send(fd)
  }

  function cancelTranscription() {
    if (xhrRef.current) { xhrRef.current.abort(); xhrRef.current = null }
    setStep('idle'); setProgress(0); setErrorMsg('Cancelado.')
    setVideoUrl(''); setVideoFileName('')
  }

  function backToLoad() {
    const v = vidRef.current; if (v) { v.pause(); v.src = '' }
    setScreen('load'); setStep('idle'); setProgress(0)
    setPhrases([]); setCurIdx(-1); setIsPlaying(false)
    setVideoUrl(''); setErrorMsg(''); setSrtSource('')
  }

  function downloadSRT() {
    if (phrases.length === 0) return
    const lines: string[] = []
    phrases.forEach((p, i) => {
      const fmt = (s: number) => {
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
        const sc = Math.floor(s % 60), ms = Math.round((s % 1) * 1000)
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')},${String(ms).padStart(3, '0')}`
      }
      lines.push(`${i + 1}\n${fmt(p.start)} --> ${fmt(p.end)}\n${p.text}\n`)
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }))
    a.download = videoFileName.replace(/\.[^.]+$/, '') + '.srt'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  function startEdit(idx: number) {
    setEditingIdx(idx)
    setEditingText(phrases[idx].text)
  }

  function saveEdit(idx: number) {
    setPhrases(prev => prev.map((p, i) => i === idx ? { ...p, text: editingText } : p))
    setEditingIdx(null)
    setEditingText('')
  }

  function cancelEdit() {
    setEditingIdx(null)
    setEditingText('')
  }

  const isTranscribing = step !== 'idle' && step !== 'done'
  const selPhrases = phrases.filter(p => p.sel)
  const showPhrases = filter === 'sel' ? phrases.filter(p => p.sel) : phrases

  const STEP_ORDER: Step[] = ['uploading', 'transcribing', 'parsing', 'done']
  const STEP_LABELS: Record<string, string> = {
    uploading: 'Subiendo video al servidor',
    transcribing: 'Gemini transcribiendo el audio',
    parsing: 'Generando archivo SRT',
  }

  return (
    <div className={styles.root}>

      {screen === 'load' && (
        <div className={styles.loadScreen}>
          <div className={styles.logo}><span className={styles.logoDot} />Virtual English — Player</div>

          {!isTranscribing ? (
            <>
              <label
                className={styles.dropzone}
                onDragOver={e => { e.preventDefault(); e.currentTarget.setAttribute('data-drag', 'true') }}
                onDragLeave={e => e.currentTarget.removeAttribute('data-drag')}
                onDrop={e => { e.preventDefault(); e.currentTarget.removeAttribute('data-drag'); handleFiles(Array.from(e.dataTransfer.files)) }}
              >
                <input type="file" accept="video/*,.avi,.mp4,.mkv,.mov,.webm,.srt" multiple
                  onChange={e => handleFiles(Array.from(e.target.files || []))} style={{ display: 'none' }} />
                <div className={styles.dzIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div className={styles.dzTitle}>Arrastrá el video aquí</div>
                <div className={styles.dzSub}>
                  Gemini transcribe el audio automáticamente y genera el SRT.<br />
                  También podés arrastrar video + SRT juntos si ya lo tenés.
                </div>
                <div className={styles.dzFormats}>
                  {['MP4', 'AVI', 'MKV', 'MOV', 'WEBM', 'SRT'].map(f => (
                    <span key={f} className={`${styles.fmt} ${['MP4', 'AVI', 'SRT'].includes(f) ? styles.fmtHi : ''}`}>{f}</span>
                  ))}
                </div>
              </label>
              {errorMsg && <div className={styles.errorBox}>{errorMsg}</div>}
            </>
          ) : (
            <div className={styles.progressBox}>
              <div className={styles.progTitle}>{stepMsg || 'Procesando...'}</div>
              <div className={styles.progSub}>
                {step === 'uploading' && 'El video se sube al servidor para que Gemini lo procese.'}
                {step === 'transcribing' && 'Gemini está analizando el audio y generando timestamps precisos...'}
                {step === 'parsing' && 'Generando archivo SRT...'}
              </div>
              <div className={styles.progBarWrap}>
                <div className={styles.progBarFill} style={{ width: progress + '%' }} />
              </div>
              <div className={styles.stepList}>
                {STEP_ORDER.filter(s => s !== 'done').map(s => {
                  const si = STEP_ORDER.indexOf(step), ti = STEP_ORDER.indexOf(s)
                  const st = ti < si ? 'done' : ti === si ? 'active' : 'idle'
                  return (
                    <div key={s} className={`${styles.stepItem} ${styles['si_' + st]}`}>
                      <span className={styles.stepDot} />{STEP_LABELS[s]}
                    </div>
                  )
                })}
              </div>
              <button className={styles.cancelBtn} onClick={cancelTranscription}>Cancelar</button>
            </div>
          )}
        </div>
      )}

      {screen === 'player' && (
        <div className={styles.playerWrap}>
          <div className={styles.topbar}>
            <div className={styles.tbLogo}><span className={styles.tbDot} />Virtual English</div>
            <div className={styles.tbSep} />
            <div className={styles.tbFile}>{videoFileName}</div>
            <div className={styles.tbRight}>
              <span className={`${styles.chip} ${styles.chipFmt}`}>{videoFileName.split('.').pop()?.toUpperCase()}</span>
              <span className={`${styles.chip} ${styles.chipSrt}`}>{srtSource}</span>
              <span className={`${styles.chip} ${styles.chipZoom}`}><span className={styles.liveDot} />Zoom</span>
              <button className={styles.tbBtn} onClick={downloadSRT}>↓ SRT</button>
              <button className={styles.tbBtn} onClick={backToLoad}>← Cargar otro</button>
            </div>
          </div>

          <div className={styles.layout}>
            <div className={styles.stage}>
              <div className={styles.shareHint}><span className={styles.shareHintDot} />Compartir en Zoom — el alumno solo ve esto</div>
              <div className={styles.videoWrap}>
                <video ref={vidRef} src={videoUrl || undefined} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
                {ccOn && subText && (
                  <div className={styles.subOverlay}>
                    <div className={styles.subBox} dangerouslySetInnerHTML={{ __html: subText }} />
                  </div>
                )}
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelBody}>
                <div className={styles.section}>
                  <div className={styles.secLabel}>Reproduciendo <span className={styles.secBadge}>⊘ Solo profesor</span></div>
                  <div className={styles.npTitle}>{videoFileName.replace(/\.[^.]+$/, '')}</div>
                  <div className={styles.npMeta}>{timeTot} · {selPhrases.length} frases sel.</div>
                  <div className={styles.prog}>
                    <div className={styles.progTimes}><span>{timeCur}</span><span>{timeTot}</span></div>
                    <div ref={progRef} className={styles.progTrack} onClick={scrub}>
                      <div className={styles.pBuf} style={{ width: bufPct + '%' }} />
                      <div className={styles.pFill} style={{ width: progPct + '%' }} />
                      <div className={styles.pThumb} style={{ left: progPct + '%' }} />
                      {phrases.map((p, i) => (
                        <div key={i} className={`${styles.ptick} ${p.sel ? styles.ptickSel : ''}`}
                          style={{ left: vidRef.current?.duration ? (p.start / vidRef.current.duration * 100) + '%' : '0%' }} />
                      ))}
                    </div>
                  </div>
                  <div className={styles.pb}>
                    <button className={styles.pbBtn} onClick={() => skip(-10)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 4v6h6" /><path d="M3.5 15A9 9 0 1 0 4 8.5" /></svg>
                    </button>
                    <div className={styles.pbSep} />
                    <button className={styles.pbBtn} onClick={prevPhrase}>
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 20L9 12l10-8v16zM5 4h2v16H5z" /></svg>
                    </button>
                    <button className={`${styles.pbBtn} ${styles.pbPlay}`} onClick={togglePlay}>
                      {isPlaying
                        ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                        : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
                    </button>
                    <button className={styles.pbBtn} onClick={nextPhrase}>
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 4l10 8-10 8V4zM17 4h2v16h-2z" /></svg>
                    </button>
                    <div className={styles.pbSep} />
                    <button className={styles.pbBtn} onClick={() => skip(10)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 4v6h-6" /><path d="M20.5 15A9 9 0 1 1 20 8.5" /></svg>
                    </button>
                  </div>
                  <button className={styles.ccRow} onClick={() => setCcOn(p => !p)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="13" rx="2" /><path d="M8 12h4M14 12h2M8 16h2M12 16h4" /></svg>
                    <span className={styles.ccLbl}>Subtítulos</span>
                    <span className={`${styles.ccBadge} ${ccOn ? styles.ccOn : styles.ccOff}`}>{ccOn ? 'ON' : 'OFF'}</span>
                  </button>
                </div>

                <div className={styles.section}>
                  <div className={styles.secLabel}>Frase actual</div>
                  <div className={styles.currPhrase}>{curIdx >= 0 ? phrases[curIdx]?.text : '—'}</div>
                  <div className={styles.phraseCtrl}>
                    <button className={styles.phBtn} onClick={prevPhrase}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>Anterior
                    </button>
                    <div className={styles.phCtr}>{curIdx >= 0 ? `${curIdx + 1} / ${phrases.length}` : '— / —'}</div>
                    <button className={styles.phBtn} onClick={nextPhrase}>
                      Siguiente<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  </div>
                  <div className={styles.microGrid}>
                    <button className={`${styles.mcBtn} ${styles.mcBl}`} onClick={microRepeat}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.5" /></svg>
                      Micro-rep.<span className={styles.kc}>W</span>
                    </button>
                    <button className={styles.mcBtn} onClick={repeatPhrase}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                      Repetir<span className={styles.kc}>R</span>
                    </button>
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.secLabel}>Velocidad</div>
                  <div className={styles.speedBtns}>
                    {SPEEDS.map((s, i) => (
                      <button key={s} className={`${styles.sp} ${i === speedIdx ? styles.spAct : ''}`} onClick={() => setSpd(i)}>{s}×</button>
                    ))}
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.secLabel}>Delay subtítulos</div>
                  <div className={styles.delayRow}>
                    <button className={styles.delayBtn} onClick={() => adjDelay(-0.5)}>−</button>
                    <div className={styles.delayVal} style={{ color: delay === 0 ? '#E8C547' : delay > 0 ? '#4B8FD8' : '#CC4444' }}>
                      {delay > 0 ? '+' : ''}{delay.toFixed(1)} s
                    </div>
                    <button className={styles.delayBtn} onClick={() => adjDelay(0.5)}>+</button>
                    <span className={styles.delayReset} onClick={() => { setDelay(0); delayRef.current = 0 }}>reset</span>
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.secLabel}>Volumen</div>
                  <div className={styles.volRow}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tx2)" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                    <div className={styles.volTrack}>
                      <div className={styles.volFill} style={{ width: vol + '%' }} />
                      <input type="range" className={styles.volRange} min={0} max={100} value={vol}
                        onChange={e => { setVol(+e.target.value); if (vidRef.current) vidRef.current.volume = +e.target.value / 100 }} />
                    </div>
                    <span className={styles.volVal}>{vol}%</span>
                  </div>
                </div>

                <div className={styles.plWrap}>
                  <div className={styles.plHd}>
                    Secuencia
                    <div className={styles.plHdR}>
                      <span className={styles.plCount}>{selPhrases.length} sel.</span>
                      {(['all', 'sel'] as const).map(f => (
                        <button key={f} className={`${styles.plFilter} ${filter === f ? styles.plFilterAct : ''}`} onClick={() => setFilter(f)}>
                          {f === 'all' ? 'Todas' : 'Sel.'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div ref={listRef} className={styles.pl}>
                    {showPhrases.length === 0 && <div className={styles.plEmpty}>Sin frases</div>}
                    {showPhrases.map(p => {
                      const oi = phrases.indexOf(p), si = selPhrases.indexOf(p), isAct = oi === curIdx
                      return (
                        <div key={oi} data-act={isAct}
                          className={`${styles.plItem} ${isAct ? styles.plAct : ''} ${p.sel ? styles.plSel : ''}`}
                          onClick={() => { if (editingIdx !== oi) jumpTo(oi) }}>
                          <div className={styles.plN}>{p.sel ? si + 1 : '·'}</div>
                          <div className={styles.plB}>
                            <div className={styles.plT}>{fmtTime(p.start)}</div>
                            {editingIdx === oi ? (
                              <div className={styles.plEdit} onClick={e => e.stopPropagation()}>
                                <input
                                  className={styles.plEditInput}
                                  value={editingText}
                                  onChange={e => setEditingText(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(oi); if (e.key === 'Escape') cancelEdit() }}
                                  autoFocus
                                />
                                <div className={styles.plEditBtns}>
                                  <button className={styles.plEditSave} onClick={() => saveEdit(oi)}>✓</button>
                                  <button className={styles.plEditCancel} onClick={cancelEdit}>✕</button>
                                </div>
                              </div>
                            ) : (
                              <div className={styles.plTxRow}>
                                <div className={styles.plTx}>{p.text}</div>
                                <button className={styles.plEditBtn} onClick={e => { e.stopPropagation(); startEdit(oi) }} title="Editar">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                              </div>
                            )}
                          </div>
                          <div className={styles.plCk} onClick={e => { e.stopPropagation(); toggleSel(oi) }}>
                            {p.sel && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className={styles.kbHint}>
                  {[['Spc', 'Play'], ['A', '← Frase'], ['D', 'Frase →'], ['W', 'Micro'], ['R', 'Repetir']].map(([k, l]) => (
                    <span key={k} className={styles.kbItem}><span className={styles.kbKey}>{k}</span>{l}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
